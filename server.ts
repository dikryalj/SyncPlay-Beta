/**
 * server.ts — SyncPlay Custom Node.js Server
 *
 * Responsibilities:
 *  - Serves the Next.js app via the custom http server.
 *  - Hosts the Socket.io server at /api/socketio.
 *  - Manages room state: users, queue, playback, host promotion.
 *  - Validates and enriches track URLs server-side via urlParser.
 *
 * Event contract (→ = Client to Server, ← = Server to Client):
 *  → join-room           { roomCode, userId, name, isHost }
 *  → leave-room          { roomCode, userId }
 *  → play                { roomCode, time, clientTs }
 *  → pause               { roomCode, time, clientTs }
 *  → seek                { roomCode, time, clientTs }
 *  → track-change        { roomCode, track }
 *  → queue-add-validated { roomCode, url, requestedBy }
 *  → queue-remove        { roomCode, trackId }
 *  → ping                { ts }
 *  ← room-state          { users, queue, currentTrack, isPlaying, currentTime, hostUserId }
 *  ← user-joined         RoomUser
 *  ← user-left           { userId }
 *  ← sync-play           { time, serverTs, actionType: "play" }
 *  ← sync-pause          { time, serverTs, actionType: "pause" }
 *  ← sync-seek           { time, serverTs, actionType: "seek" }
 *  ← sync-track          { track }
 *  ← queue-update        { queue }
 *  ← host-changed        { newHostId }
 *  ← pong                { ts, serverTs }
 *  ← error               { code, message }
 */

import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server, Socket } from "socket.io";
import { parseTrackUrl } from "./src/lib/urlParser";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST ?? "localhost";
const port = parseInt(process.env.PORT ?? "3000", 10);

// ── Room state ───────────────────────────────────────────────────────────────

interface RoomUser {
  id: string;
  name: string;
  isHost: boolean;
  isOnline: boolean;
  socketId: string;
}

interface RoomTrack {
  id: string;
  title: string;
  artist: string;
  duration: number;
  url?: string;
  originalUrl?: string;
  source?: "youtube" | "spotify" | "direct";
  thumbnailUrl?: string;
  coverUrl?: string;
}

interface RoomState {
  code: string;
  /** Socket id of the current host (may differ from userId after reconnect) */
  hostSocketId: string | null;
  /** User id of the current host */
  hostUserId: string | null;
  users: Map<string, RoomUser>;
  queue: RoomTrack[];
  currentTrack: RoomTrack | null;
  isPlaying: boolean;
  currentTime: number;
  lastSyncAt: number;
}

const rooms = new Map<string, RoomState>();

function getOrCreateRoom(code: string): RoomState {
  if (!rooms.has(code)) {
    rooms.set(code, {
      code,
      hostSocketId: null,
      hostUserId: null,
      users: new Map(),
      queue: [],
      currentTrack: null,
      isPlaying: false,
      currentTime: 0,
      lastSyncAt: Date.now(),
    });
  }
  return rooms.get(code)!;
}

/**
 * Calculate where the host's playback position is RIGHT NOW,
 * accounting for elapsed wall-clock time since the last sync point.
 */
function getEstimatedTime(room: RoomState): number {
  if (!room.isPlaying) return room.currentTime;
  return room.currentTime + (Date.now() - room.lastSyncAt) / 1000;
}

/**
 * Promote the next available online user to host.
 * Returns the new host's userId, or null if no users remain.
 */
function promoteNextHost(room: RoomState, io: Server): string | null {
  const candidates = Array.from(room.users.values()).filter(
    (u) => u.isOnline && !u.isHost
  );
  if (candidates.length === 0) return null;

  const newHost = candidates[0];
  newHost.isHost = true;
  room.hostUserId = newHost.id;
  room.hostSocketId = newHost.socketId;

  io.to(room.code).emit("host-changed", { newHostId: newHost.id });
  console.log(`[${room.code}] Host promoted → ${newHost.name} (${newHost.id})`);
  return newHost.id;
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

const httpServer = createServer();
const app = next({ dev, hostname, port, httpServer });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  httpServer.on("request", (req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    path: "/api/socketio",
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  // ── Connection handler ───────────────────────────────────────────────────

  io.on("connection", (socket: Socket) => {
    let currentRoom: string | null = null;
    let currentUserId: string | null = null;

    // ── join-room ──────────────────────────────────────────────────────────
    socket.on(
      "join-room",
      ({
        roomCode,
        userId,
        name,
        isHost,
      }: {
        roomCode: string;
        userId: string;
        name: string;
        isHost: boolean;
      }) => {
        currentRoom = roomCode;
        currentUserId = userId;
        socket.join(roomCode);

        const room = getOrCreateRoom(roomCode);

        // If user is reconnecting, update their socket reference
        if (room.users.has(userId)) {
          const existing = room.users.get(userId)!;
          existing.socketId = socket.id;
          existing.isOnline = true;
          // Restore host socket reference if they were the host
          if (existing.isHost) {
            room.hostSocketId = socket.id;
          }
          console.log(`[${roomCode}] Reconnect: ${name} (${userId})`);
        } else {
          // New user
          const user: RoomUser = {
            id: userId,
            name,
            isHost: isHost && !room.hostUserId, // only first host claim wins
            isOnline: true,
            socketId: socket.id,
          };
          room.users.set(userId, user);

          if (isHost && !room.hostUserId) {
            room.hostSocketId = socket.id;
            room.hostUserId = userId;
          }

          socket.to(roomCode).emit("user-joined", user);
        }

        // Send the full current room state to the joining user (late-joiner sync)
        socket.emit("room-state", {
          users: Array.from(room.users.values()),
          queue: room.queue,
          currentTrack: room.currentTrack,
          isPlaying: room.isPlaying,
          currentTime: getEstimatedTime(room),
          hostUserId: room.hostUserId,
        });

        console.log(`[${roomCode}] ${name} joined. Users: ${room.users.size}`);
      }
    );

    // ── leave-room ─────────────────────────────────────────────────────────
    socket.on(
      "leave-room",
      ({ roomCode, userId }: { roomCode: string; userId: string }) => {
        handleUserLeave(roomCode, userId, socket, io, /* permanent */ true);
      }
    );

    // ── play ───────────────────────────────────────────────────────────────
    socket.on(
      "play",
      ({
        roomCode,
        time,
        clientTs,
      }: {
        roomCode: string;
        time: number;
        clientTs?: number;
      }) => {
        const room = rooms.get(roomCode);
        if (!room) return;
        // Guard: only the host can control playback
        if (socket.id !== room.hostSocketId) return;

        room.isPlaying = true;
        room.currentTime = time;
        room.lastSyncAt = Date.now();

        io.to(roomCode).emit("sync-play", {
          time,
          serverTs: room.lastSyncAt,
          actionType: "play",
        });
      }
    );

    // ── pause ──────────────────────────────────────────────────────────────
    socket.on(
      "pause",
      ({
        roomCode,
        time,
        clientTs,
      }: {
        roomCode: string;
        time: number;
        clientTs?: number;
      }) => {
        const room = rooms.get(roomCode);
        if (!room) return;
        if (socket.id !== room.hostSocketId) return;

        room.isPlaying = false;
        room.currentTime = time;
        room.lastSyncAt = Date.now();

        io.to(roomCode).emit("sync-pause", {
          time,
          serverTs: room.lastSyncAt,
          actionType: "pause",
        });
      }
    );

    // ── seek ───────────────────────────────────────────────────────────────
    socket.on(
      "seek",
      ({
        roomCode,
        time,
        clientTs,
      }: {
        roomCode: string;
        time: number;
        clientTs?: number;
      }) => {
        const room = rooms.get(roomCode);
        if (!room) return;
        if (socket.id !== room.hostSocketId) return;

        room.currentTime = time;
        room.lastSyncAt = Date.now();

        io.to(roomCode).emit("sync-seek", {
          time,
          serverTs: room.lastSyncAt,
          actionType: "seek",
        });
      }
    );

    // ── track-change ───────────────────────────────────────────────────────
    socket.on(
      "track-change",
      ({ roomCode, track }: { roomCode: string; track: RoomTrack }) => {
        const room = rooms.get(roomCode);
        if (!room) return;
        if (socket.id !== room.hostSocketId) return;

        room.currentTrack = track;
        room.currentTime = 0;
        room.isPlaying = false;
        room.lastSyncAt = Date.now();

        io.to(roomCode).emit("sync-track", { track });
      }
    );

    // ── queue-add-validated ────────────────────────────────────────────────
    // Any user can add to the queue; the server validates the URL.
    socket.on(
      "queue-add-validated",
      async ({
        roomCode,
        url,
        requestedBy,
      }: {
        roomCode: string;
        url: string;
        requestedBy: string;
      }) => {
        const room = rooms.get(roomCode);
        if (!room) return;

        const result = await parseTrackUrl(url);

        if (!result.ok) {
          socket.emit("error", {
            code: result.error,
            message: result.message,
          });
          return;
        }

        const track: RoomTrack = {
          ...result.track,
          // Tag who added it (artist field gets appended for display)
          artist: result.track.artist
            ? `${result.track.artist} · added by ${requestedBy}`
            : `Added by ${requestedBy}`,
        };

        room.queue.push(track);

        // If queue was empty and nothing is playing, auto-select this track
        if (!room.currentTrack) {
          room.currentTrack = track;
          io.to(roomCode).emit("sync-track", { track });
        }

        io.to(roomCode).emit("queue-update", { queue: room.queue });
        console.log(`[${roomCode}] Queue add: "${track.title}" (${track.source})`);
      }
    );

    // ── queue-remove ───────────────────────────────────────────────────────
    socket.on(
      "queue-remove",
      ({ roomCode, trackId }: { roomCode: string; trackId: string }) => {
        const room = rooms.get(roomCode);
        if (!room) return;
        if (socket.id !== room.hostSocketId) return;

        room.queue = room.queue.filter((t) => t.id !== trackId);
        io.to(roomCode).emit("queue-update", { queue: room.queue });
      }
    );

    // ── ping ───────────────────────────────────────────────────────────────
    socket.on("ping", ({ ts }: { ts: number }) => {
      socket.emit("pong", { ts, serverTs: Date.now() });
    });

    // ── disconnect ─────────────────────────────────────────────────────────
    socket.on("disconnect", (reason) => {
      if (currentRoom && currentUserId) {
        // Mark offline but keep in map for potential reconnect
        const room = rooms.get(currentRoom);
        if (room) {
          const user = room.users.get(currentUserId);
          if (user) {
            user.isOnline = false;

            const wasHost = user.isHost;
            if (wasHost) {
              user.isHost = false;
              room.hostSocketId = null;
              room.hostUserId = null;
              // Promote another user if available
              promoteNextHost(room, io);
            }

            io.to(currentRoom).emit("user-left", { userId: currentUserId });

            // Clean up room if completely empty
            const anyOnline = Array.from(room.users.values()).some((u) => u.isOnline);
            if (!anyOnline) {
              // Give 30s grace window for reconnects before destroying
              setTimeout(() => {
                const r = rooms.get(currentRoom!);
                if (r) {
                  const stillOnline = Array.from(r.users.values()).some((u) => u.isOnline);
                  if (!stillOnline) {
                    rooms.delete(currentRoom!);
                    console.log(`[${currentRoom}] Room destroyed (empty)`);
                  }
                }
              }, 30_000);
            }
          }
        }
      }
      console.log(`Socket disconnected: ${socket.id} (${reason})`);
    });
  });

  // ── Start ────────────────────────────────────────────────────────────────

  httpServer.listen(port, () => {
    console.log(`\n🎧 SyncPlay ready → http://${hostname}:${port}`);
    console.log(`   Socket.io  → /api/socketio`);
    console.log(`   Mode       → ${dev ? "development" : "production"}\n`);
  });
});

// ── Shared helper ────────────────────────────────────────────────────────────

function handleUserLeave(
  roomCode: string,
  userId: string,
  socket: Socket,
  io: Server,
  permanent: boolean
): void {
  const room = rooms.get(roomCode);
  if (!room) return;

  if (permanent) {
    room.users.delete(userId);
  } else {
    const u = room.users.get(userId);
    if (u) u.isOnline = false;
  }

  io.to(roomCode).emit("user-left", { userId });
  socket.leave(roomCode);

  if (room.users.size === 0) {
    rooms.delete(roomCode);
  }
}
