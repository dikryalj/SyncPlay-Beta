/**
 * /api/pusher/auth — Presence Channel Authentication Endpoint
 *
 * Pusher JS client calls this automatically when subscribing to
 * `presence-{roomCode}`. We sign the request with the Pusher secret
 * and return user identity so Pusher knows who this member is.
 */

import { NextRequest, NextResponse } from "next/server";
import { getPusherServer } from "@/lib/pusher";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.text();
  const params = new URLSearchParams(body);

  const socketId   = params.get("socket_id");
  const channel    = params.get("channel_name");
  const userId     = params.get("user_id")   ?? "anonymous";
  const userName   = params.get("user_name") ?? "Listener";

  if (!socketId || !channel) {
    return NextResponse.json({ error: "Missing socket_id or channel_name" }, { status: 400 });
  }

  // Only allow presence channels for this app
  if (!channel.startsWith("presence-")) {
    return NextResponse.json({ error: "Forbidden channel" }, { status: 403 });
  }

  const pusher = getPusherServer();

  const authResponse = pusher.authorizeChannel(socketId, channel, {
    user_id: userId,
    user_info: { name: userName },
  });

  return NextResponse.json(authResponse);
}
