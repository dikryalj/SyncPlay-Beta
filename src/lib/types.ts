/**
 * types.ts — Shared TypeScript types for SyncPlay serverless architecture.
 * Used across API routes, hooks, and components.
 */

export type TrackSource = "youtube" | "spotify" | "direct";

export interface Track {
  id: string;
  title: string;
  artist: string;
  /** Duration in seconds. 0 = unknown (YouTube oEmbed doesn't expose it). */
  duration: number;
  /** Playback URL. For YouTube: nocookie embed URL. For Spotify: embed URL. */
  url?: string;
  originalUrl?: string;
  source?: TrackSource;
  thumbnailUrl?: string;
  coverUrl?: string;
}

export interface RoomMember {
  id: string;
  name: string;
  isHost: boolean;
  isOnline: boolean;
}

/** Matches the `rooms` table schema in Supabase */
export interface DbRoom {
  code: string;
  host_user_id: string;
  is_playing: boolean;
  playback_time: number;
  last_sync_at: string; // ISO timestamp
  queue: Track[];
  current_track: Track | null;
  created_at: string;
}

/** Matches the `room_members` table schema */
export interface DbMember {
  room_code: string;
  user_id: string;
  name: string;
  is_host: boolean;
  joined_at: string;
}

/** Hydrated room state returned from the join API */
export interface RoomStateResponse {
  code: string;
  hostUserId: string;
  isPlaying: boolean;
  playbackTime: number;
  lastSyncAt: string;
  queue: Track[];
  currentTrack: Track | null;
  members: RoomMember[];
}

export type SyncAction = "play" | "pause" | "seek" | "track-change";

export interface SyncEvent {
  time: number;
  serverTimestamp: number;
  actionType: SyncAction;
  track?: Track;
}
