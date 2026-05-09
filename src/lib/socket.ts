/**
 * socket.ts
 * Socket.io client singleton for SyncPlay.
 *
 * Features:
 *  - Singleton socket with lazy initialisation.
 *  - Automatic room re-join on reconnect (call setRoomContext before joining).
 *  - Typed event constants for every client↔server event.
 */

import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

// ── Room context for auto reconnect ─────────────────────────────────────────

interface RoomContext {
  roomCode: string;
  userId: string;
  name: string;
  isHost: boolean;
}

let _roomContext: RoomContext | null = null;

/**
 * Store the room context so the socket can automatically re-join
 * after a reconnection event.
 */
export function setRoomContext(ctx: RoomContext): void {
  _roomContext = ctx;
}

export function clearRoomContext(): void {
  _roomContext = null;
}

// ── Socket singleton ─────────────────────────────────────────────────────────

export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      path: "/api/socketio",
      transports: ["websocket", "polling"],
      // Automatically attempt to reconnect
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    // On successful reconnect, re-join the current room so the server
    // restores the user's membership and sends a fresh room-state.
    socket.on("reconnect", () => {
      if (_roomContext) {
        socket!.emit(EVENTS.JOIN_ROOM, {
          roomCode: _roomContext.roomCode,
          userId: _roomContext.userId,
          name: _roomContext.name,
          isHost: _roomContext.isHost,
        });
      }
    });
  }
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

// ── Event type constants ──────────────────────────────────────────────────────

export const EVENTS = {
  // ── Client → Server ────────────────────────────────────────────────────────
  JOIN_ROOM:            "join-room",
  LEAVE_ROOM:           "leave-room",
  PLAY:                 "play",
  PAUSE:                "pause",
  SEEK:                 "seek",
  TRACK_CHANGE:         "track-change",
  /** Client sends raw URL; server validates and enriches before adding. */
  QUEUE_ADD_VALIDATED:  "queue-add-validated",
  QUEUE_REMOVE:         "queue-remove",
  PING:                 "ping",

  // ── Server → Client ────────────────────────────────────────────────────────
  ROOM_STATE:           "room-state",
  USER_JOINED:          "user-joined",
  USER_LEFT:            "user-left",
  SYNC_PLAY:            "sync-play",
  SYNC_PAUSE:           "sync-pause",
  SYNC_SEEK:            "sync-seek",
  SYNC_TRACK:           "sync-track",
  QUEUE_UPDATE:         "queue-update",
  /** Emitted when a new user becomes the room host (e.g. previous host disconnected). */
  HOST_CHANGED:         "host-changed",
  PONG:                 "pong",
  ERROR:                "error",
} as const;

export type EventKey = keyof typeof EVENTS;
export type EventName = (typeof EVENTS)[EventKey];
