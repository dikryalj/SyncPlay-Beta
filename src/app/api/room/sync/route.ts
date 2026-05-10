/**
 * /api/room/sync — Playback Synchronization Endpoint
 *
 * Handles play, pause, seek, and track-change actions from the host.
 * Updates Supabase then broadcasts via Pusher so all listeners sync instantly.
 *
 * Body: { roomCode, userId, action, time?, track? }
 * Returns: { ok: true }
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { getPusherServer } from "@/lib/pusher";
import type { SyncAction, Track } from "@/lib/types";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const {
    roomCode,
    userId,
    action,
    time = 0,
    track,
  }: {
    roomCode: string;
    userId:   string;
    action:   SyncAction;
    time?:    number;
    track?:   Track;
  } = await req.json();

  if (!roomCode || !userId || !action) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const db     = createServerSupabase();
  const pusher = getPusherServer();

  // ── Host guard ────────────────────────────────────────────────────────────
  const { data: room } = await db
    .from("rooms")
    .select("host_user_id")
    .eq("code", roomCode)
    .single();

  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }
  if (room.host_user_id !== userId) {
    return NextResponse.json({ error: "Only the host can control playback" }, { status: 403 });
  }

  const serverTimestamp = Date.now();
  const now             = new Date(serverTimestamp).toISOString();

  // ── Apply action ─────────────────────────────────────────────────────────
  switch (action) {
    case "play": {
      await db.from("rooms").update({
        is_playing:    true,
        playback_time: time,
        last_sync_at:  now,
      }).eq("code", roomCode);

      await pusher.trigger(`presence-${roomCode}`, "sync-play", {
        time, serverTimestamp, actionType: "play",
      });
      break;
    }

    case "pause": {
      await db.from("rooms").update({
        is_playing:    false,
        playback_time: time,
        last_sync_at:  now,
      }).eq("code", roomCode);

      await pusher.trigger(`presence-${roomCode}`, "sync-pause", {
        time, serverTimestamp, actionType: "pause",
      });
      break;
    }

    case "seek": {
      await db.from("rooms").update({
        playback_time: time,
        last_sync_at:  now,
      }).eq("code", roomCode);

      await pusher.trigger(`presence-${roomCode}`, "sync-seek", {
        time, serverTimestamp, actionType: "seek",
      });
      break;
    }

    case "track-change": {
      if (!track) {
        return NextResponse.json({ error: "track required for track-change" }, { status: 400 });
      }
      await db.from("rooms").update({
        current_track: track,
        is_playing:    false,
        playback_time: 0,
        last_sync_at:  now,
      }).eq("code", roomCode);

      await pusher.trigger(`presence-${roomCode}`, "sync-track", {
        track, serverTimestamp, actionType: "track-change",
      });
      break;
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
