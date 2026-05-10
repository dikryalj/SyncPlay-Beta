/**
 * pusher-client.ts — Browser-side Pusher JS singleton.
 * ONLY import this from client components and hooks ("use client").
 * Never import in API routes or server components.
 */

"use client";

import PusherClient from "pusher-js";

let _client: PusherClient | null = null;
let _boundUserId: string | null = null;

/**
 * Returns (or creates) the Pusher JS singleton.
 * userId/userName are attached as auth params so the presence
 * channel auth endpoint (/api/pusher/auth) knows who this member is.
 */
export function getPusherClient(
  userId: string,
  userName: string,
  forceNew = false
): PusherClient {
  if (_client && _boundUserId === userId && !forceNew) {
    return _client;
  }

  if (_client) {
    _client.disconnect();
    _client = null;
  }

  _boundUserId = userId;
  _client = new PusherClient(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
    cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    channelAuthorization: {
      endpoint:  "/api/pusher/auth",
      transport: "ajax",
      params:    { user_id: userId, user_name: userName },
    },
  });

  return _client;
}

export function disconnectPusherClient(): void {
  if (_client) {
    _client.disconnect();
    _client = null;
    _boundUserId = null;
  }
}
