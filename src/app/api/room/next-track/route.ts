/**
 * /api/room/next-track — Auto Queue Progression
 *
 * Called by the host when a track ends (onEnded).
 * Removes the finished track from the Supabase queue,
 * promotes the next one as current_track, and broadcasts
 * sync-track + queue-update via Pusher.
 *
 * Body: { roomCode, userId }
 * Returns: { ok: true, nextTrack: Track | null }
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { getPusherServer } from "@/lib/pusher-server";
import type { Track } from "@/lib/types";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { roomCode, userId } = await req.json();

  if (!roomCode || !userId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const db     = createServerSupabase();
  const pusher = getPusherServer();

  // ── Fetch room ────────────────────────────────────────────────────────────
  const { data: room } = await db
    .from("rooms")
    .select("*")
    .eq("code", roomCode)
    .single();

  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });
  if (room.host_user_id !== userId) {
    return NextResponse.json({ error: "Only the host can advance the queue" }, { status: 403 });
  }

  const queue: Track[]      = room.queue ?? [];
  const currentTrack: Track = room.current_track;
  const serverTimestamp     = Date.now();

  // ── Find & remove current track from queue ────────────────────────────────
  const currentIdx = currentTrack
    ? queue.findIndex((t) => t.id === currentTrack.id)
    : -1;

  // Remove the finished track
  const newQueue = currentIdx >= 0
    ? queue.filter((_, i) => i !== currentIdx)
    : queue;

  // Pick next track (the one that was after the current)
  const nextTrack: Track | null = newQueue.length > 0
    ? (newQueue[currentIdx] ?? newQueue[0]) // stay at same index, or wrap to first
    : null;

  // ── Persist to Supabase ───────────────────────────────────────────────────
  await db.from("rooms").update({
    queue:         newQueue,
    current_track: nextTrack,
    is_playing:    false,
    playback_time: 0,
    last_sync_at:  new Date(serverTimestamp).toISOString(),
  }).eq("code", roomCode);

  // ── Broadcast via Pusher ──────────────────────────────────────────────────
  await pusher.trigger(`presence-${roomCode}`, "queue-update", {
    queue: newQueue,
  });

  await pusher.trigger(`presence-${roomCode}`, "sync-track", {
    track:           nextTrack,
    serverTimestamp,
    actionType:      "track-change",
  });

  return NextResponse.json({ ok: true, nextTrack });
}
