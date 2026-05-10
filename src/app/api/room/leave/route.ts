/**
 * /api/room/leave — Leave Room & Host Promotion
 *
 * Called on component unmount or beforeunload.
 * If the leaving user was the host, promotes the next available member
 * (earliest `joined_at`) and broadcasts host-changed via Pusher.
 *
 * Body: { roomCode, userId }
 * Returns: { ok: true }
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { getPusherServer } from "@/lib/pusher";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { roomCode, userId } = await req.json();

  if (!roomCode || !userId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const db     = createServerSupabase();
  const pusher = getPusherServer();

  // ── Get current room ───────────────────────────────────────────────────────
  const { data: room } = await db
    .from("rooms")
    .select("host_user_id")
    .eq("code", roomCode)
    .single();

  if (!room) return NextResponse.json({ ok: true }); // Room already gone

  const wasHost = room.host_user_id === userId;

  // ── Remove member ──────────────────────────────────────────────────────────
  await db
    .from("room_members")
    .delete()
    .eq("room_code", roomCode)
    .eq("user_id", userId);

  // ── Broadcast user-left ────────────────────────────────────────────────────
  await pusher.trigger(`presence-${roomCode}`, "user-left", { userId });

  // ── Host promotion ─────────────────────────────────────────────────────────
  if (wasHost) {
    const { data: remainingMembers } = await db
      .from("room_members")
      .select("user_id, name, joined_at")
      .eq("room_code", roomCode)
      .order("joined_at", { ascending: true })
      .limit(1);

    if (remainingMembers && remainingMembers.length > 0) {
      const newHost = remainingMembers[0];

      // Update room host
      await db
        .from("rooms")
        .update({ host_user_id: newHost.user_id })
        .eq("code", roomCode);

      // Mark new host in members table
      await db
        .from("room_members")
        .update({ is_host: true })
        .eq("room_code", roomCode)
        .eq("user_id", newHost.user_id);

      await pusher.trigger(`presence-${roomCode}`, "host-changed", {
        newHostId: newHost.user_id,
      });
    } else {
      // No members left — clean up the room
      await db.from("rooms").delete().eq("code", roomCode);
    }
  }

  return NextResponse.json({ ok: true });
}
