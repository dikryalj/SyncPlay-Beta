import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST ?? "localhost";
const port = parseInt(process.env.PORT ?? "3000", 10);

// ── Room state ───────────────────────────────────────────────
interface RoomUser {
  id: string;
  name: string;
  isHost: boolean;
  isOnline: boolean;
  socketId: string;
}
interface RoomTrack {
  id: string; title: string; artist: string; duration: number; url?: string;
}
interface RoomState {
  code: string;
  hostSocketId: string | null;
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
      code, hostSocketId: null, users: new Map(), queue: [],
      currentTrack: null, isPlaying: false, currentTime: 0, lastSyncAt: Date.now(),
    });
  }
  return rooms.get(code)!;
}

function getEstimatedTime(room: RoomState): number {
  if (!room.isPlaying) return room.currentTime;
  return room.currentTime + (Date.now() - room.lastSyncAt) / 1000;
}

// ── Bootstrap ────────────────────────────────────────────────
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

  io.on("connection", (socket) => {
    let currentRoom: string | null = null;
    let currentUserId: string | null = null;

    socket.on("join-room", ({ roomCode, userId, name, isHost }: {
      roomCode: string; userId: string; name: string; isHost: boolean;
    }) => {
      currentRoom = roomCode; currentUserId = userId;
      socket.join(roomCode);
      const room = getOrCreateRoom(roomCode);
      const user: RoomUser = { id: userId, name, isHost, isOnline: true, socketId: socket.id };
      room.users.set(userId, user);
      if (isHost && !room.hostSocketId) room.hostSocketId = socket.id;
      socket.emit("room-state", {
        users: Array.from(room.users.values()),
        queue: room.queue, currentTrack: room.currentTrack,
        isPlaying: room.isPlaying, currentTime: getEstimatedTime(room),
      });
      socket.to(roomCode).emit("user-joined", user);
    });

    socket.on("leave-room", ({ roomCode, userId }: { roomCode: string; userId: string }) => {
      const room = rooms.get(roomCode);
      if (room) {
        room.users.delete(userId);
        io.to(roomCode).emit("user-left", { userId });
        if (room.users.size === 0) rooms.delete(roomCode);
      }
      socket.leave(roomCode);
    });

    socket.on("play", ({ roomCode, time }: { roomCode: string; time: number }) => {
      const room = rooms.get(roomCode); if (!room) return;
      room.isPlaying = true; room.currentTime = time; room.lastSyncAt = Date.now();
      io.to(roomCode).emit("sync-play", { time });
    });

    socket.on("pause", ({ roomCode, time }: { roomCode: string; time: number }) => {
      const room = rooms.get(roomCode); if (!room) return;
      room.isPlaying = false; room.currentTime = time; room.lastSyncAt = Date.now();
      io.to(roomCode).emit("sync-pause", { time });
    });

    socket.on("seek", ({ roomCode, time }: { roomCode: string; time: number }) => {
      const room = rooms.get(roomCode); if (!room) return;
      room.currentTime = time; room.lastSyncAt = Date.now();
      io.to(roomCode).emit("sync-seek", { time });
    });

    socket.on("track-change", ({ roomCode, track }: { roomCode: string; track: RoomTrack }) => {
      const room = rooms.get(roomCode); if (!room) return;
      room.currentTrack = track; room.currentTime = 0; room.isPlaying = false; room.lastSyncAt = Date.now();
      io.to(roomCode).emit("sync-track", { track });
    });

    socket.on("queue-add", ({ roomCode, track }: { roomCode: string; track: RoomTrack }) => {
      const room = rooms.get(roomCode); if (!room) return;
      room.queue.push(track);
      io.to(roomCode).emit("queue-update", { queue: room.queue });
    });

    socket.on("queue-remove", ({ roomCode, trackId }: { roomCode: string; trackId: string }) => {
      const room = rooms.get(roomCode); if (!room) return;
      room.queue = room.queue.filter((t) => t.id !== trackId);
      io.to(roomCode).emit("queue-update", { queue: room.queue });
    });

    socket.on("ping", ({ ts }: { ts: number }) => {
      socket.emit("pong", { ts, serverTs: Date.now() });
    });

    socket.on("disconnect", () => {
      if (currentRoom && currentUserId) {
        const room = rooms.get(currentRoom);
        if (room) {
          room.users.delete(currentUserId);
          io.to(currentRoom).emit("user-left", { userId: currentUserId });
          if (room.users.size === 0) rooms.delete(currentRoom);
        }
      }
    });
  });

  httpServer.listen(port, () => {
    console.log(`\n🎧 SyncPlay ready → http://${hostname}:${port}`);
    console.log(`   Socket.io  → /api/socketio`);
    console.log(`   Mode       → ${dev ? "development" : "production"}\n`);
  });
});
