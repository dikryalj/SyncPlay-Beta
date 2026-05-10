/**
 * /api/room/queue — Queue Management Endpoint
 *
 * Any member can add; only the host can remove.
 * Validates URLs server-side via urlParser before adding.
 *
 * Body (add):    { roomCode, userId, action: "add", url, requestedBy }
 * Body (remove): { roomCode, userId, action: "remove", trackId }
 * Returns: { ok: true, track? }
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { getPusherServer } from "@/lib/pusher-server";
import { parseTrackUrl } from "@/lib/urlParser";
import type { Track } from "@/lib/types";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json();
  const { roomCode, userId, action } = body;

  if (!roomCode || !userId || !action) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const db     = createServerSupabase();
  const pusher = getPusherServer();

  const { data: room } = await db
    .from("rooms")
    .select("*")
    .eq("code", roomCode)
    .single();

  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  // ── ADD ───────────────────────────────────────────────────────────────────
  if (action === "add") {
    const { url, requestedBy = "Someone" } = body;
    if (!url) return NextResponse.json({ error: "URL required" }, { status: 400 });

    const result = await parseTrackUrl(url);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, message: result.message },
        { status: 422 }
      );
    }

    const track: Track = {
      ...result.track,
      artist: result.track.artist
        ? `${result.track.artist} · added by ${requestedBy}`
        : `Added by ${requestedBy}`,
    };

    const currentQueue: Track[] = room.queue ?? [];
    const newQueue = [...currentQueue, track];

    const updates: Record<string, unknown> = { queue: newQueue };
    let autoSelectedTrack: Track | null = null;

    // Auto-select as currentTrack if queue was empty
    if (!room.current_track) {
      updates.current_track = track;
      autoSelectedTrack = track;
    }

    await db.from("rooms").update(updates).eq("code", roomCode);

    await pusher.trigger(`presence-${roomCode}`, "queue-update", { queue: newQueue });

    if (autoSelectedTrack) {
      await pusher.trigger(`presence-${roomCode}`, "sync-track", {
        track: autoSelectedTrack,
        serverTimestamp: Date.now(),
        actionType: "track-change",
      });
    }

    return NextResponse.json({ ok: true, track });
  }

  // ── REMOVE ────────────────────────────────────────────────────────────────
  if (action === "remove") {
    // Only host can remove
    if (room.host_user_id !== userId) {
      return NextResponse.json({ error: "Only the host can remove tracks" }, { status: 403 });
    }

    const { trackId } = body;
    if (!trackId) return NextResponse.json({ error: "trackId required" }, { status: 400 });

    const currentQueue: Track[] = room.queue ?? [];
    const newQueue = currentQueue.filter((t) => t.id !== trackId);

    await db.from("rooms").update({ queue: newQueue }).eq("code", roomCode);
    await pusher.trigger(`presence-${roomCode}`, "queue-update", { queue: newQueue });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
