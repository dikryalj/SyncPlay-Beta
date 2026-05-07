import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      path: "/api/socketio",
      transports: ["websocket", "polling"],
    });
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

// Event types
export const EVENTS = {
  // Client → Server
  JOIN_ROOM:    "join-room",
  LEAVE_ROOM:   "leave-room",
  PLAY:         "play",
  PAUSE:        "pause",
  SEEK:         "seek",
  TRACK_CHANGE: "track-change",
  QUEUE_ADD:    "queue-add",
  QUEUE_REMOVE: "queue-remove",
  PING:         "ping",

  // Server → Client
  ROOM_STATE:   "room-state",
  USER_JOINED:  "user-joined",
  USER_LEFT:    "user-left",
  SYNC_PLAY:    "sync-play",
  SYNC_PAUSE:   "sync-pause",
  SYNC_SEEK:    "sync-seek",
  SYNC_TRACK:   "sync-track",
  QUEUE_UPDATE: "queue-update",
  PONG:         "pong",
  ERROR:        "error",
} as const;
