/**
 * /api/room/join — Join or Create a Room
 *
 * Called on room page mount. Creates the room in Supabase if it doesn't exist,
 * upserts the member, and returns the full current room state for initial hydration.
 *
 * Body: { roomCode, userId, name, isHost, initialUrl? }
 * Returns: RoomStateResponse
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { getPusherServer } from "@/lib/pusher-server";
import { parseTrackUrl } from "@/lib/urlParser";
import type { RoomMember, RoomStateResponse, Track } from "@/lib/types";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { roomCode, userId, name, isHost, initialUrl } = await req.json();

  if (!roomCode || !userId || !name) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const db     = createServerSupabase();
  const pusher = getPusherServer();
  const now    = new Date().toISOString();

  // ── 1. Upsert room ────────────────────────────────────────────────────────
  const { data: existingRoom } = await db
    .from("rooms")
    .select("*")
    .eq("code", roomCode)
    .single();

  let room = existingRoom;

  if (!room) {
    // Create new room — first joiner becomes host regardless of isHost flag
    const { data: newRoom, error } = await db
      .from("rooms")
      .insert({
        code:          roomCode,
        host_user_id:  userId,
        is_playing:    false,
        playback_time: 0,
        last_sync_at:  now,
        queue:         [],
        current_track: null,
      })
      .select()
      .single();

    if (error || !newRoom) {
      return NextResponse.json({ error: "Failed to create room" }, { status: 500 });
    }
    room = newRoom;
  }

  // ── 2. Upsert member ──────────────────────────────────────────────────────
  const memberIsHost = room.host_user_id === userId;

  await db.from("room_members").upsert(
    { room_code: roomCode, user_id: userId, name, is_host: memberIsHost, joined_at: now },
    { onConflict: "room_code,user_id" }
  );

  // ── 3. Broadcast user-joined to others ────────────────────────────────────
  await pusher.trigger(`presence-${roomCode}`, "user-joined", {
    id: userId, name, isHost: memberIsHost, isOnline: true,
  });

  // ── 4. Handle initial URL (host only, new rooms) ──────────────────────────
  if (isHost && initialUrl && initialUrl.trim() && !existingRoom) {
    const result = await parseTrackUrl(initialUrl.trim());
    if (result.ok) {
      const track: Track = {
        ...result.track,
        artist: result.track.artist
          ? `${result.track.artist} · added by ${name}`
          : `Added by ${name}`,
      };
      const newQueue = [track];
      await db
        .from("rooms")
        .update({ queue: newQueue, current_track: track })
        .eq("code", roomCode);

      room.queue         = newQueue;
      room.current_track = track;

      await pusher.trigger(`presence-${roomCode}`, "queue-update", { queue: newQueue });
      await pusher.trigger(`presence-${roomCode}`, "sync-track",   { track });
    }
  }

  // ── 5. Fetch all current members ──────────────────────────────────────────
  const { data: dbMembers } = await db
    .from("room_members")
    .select("*")
    .eq("room_code", roomCode);

  const members: RoomMember[] = (dbMembers ?? []).map((m) => ({
    id:       m.user_id,
    name:     m.name,
    isHost:   m.is_host,
    isOnline: true,
  }));

  // ── 6. Return hydrated room state ─────────────────────────────────────────
  const response: RoomStateResponse = {
    code:         room.code,
    hostUserId:   room.host_user_id,
    isPlaying:    room.is_playing,
    playbackTime: room.playback_time,
    lastSyncAt:   room.last_sync_at,
    queue:        room.queue ?? [],
    currentTrack: room.current_track ?? null,
    members,
  };

  return NextResponse.json(response);
}
