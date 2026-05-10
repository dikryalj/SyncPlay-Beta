/**
 * pusher.ts — Pusher client/server factory for SyncPlay.
 *
 * Server-side: uses `pusher` npm package to trigger events from API routes.
 * Client-side: uses `pusher-js` to subscribe to presence channels.
 *
 * Channel naming: `presence-{roomCode}`
 */

// ── Server-side (API Routes only) ─────────────────────────────────────────────
import PusherServer from "pusher";

export function getPusherServer(): PusherServer {
  return new PusherServer({
    appId:   process.env.PUSHER_APP_ID!,
    key:     process.env.NEXT_PUBLIC_PUSHER_KEY!,
    secret:  process.env.PUSHER_SECRET!,
    cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    useTLS:  true,
  });
}

// ── Client-side (hooks/components) ────────────────────────────────────────────
import PusherClient from "pusher-js";

let _pusherClient: PusherClient | null = null;
let _pusherUserId: string | null = null;

/**
 * Returns (or creates) a singleton Pusher JS client.
 * userId/userName are passed to the presence auth endpoint so Pusher
 * knows who this member is in the channel.
 *
 * If userId changes (e.g. after navigation), pass forceNew=true.
 */
export function getPusherClient(
  userId: string,
  userName: string,
  forceNew = false
): PusherClient {
  if (_pusherClient && _pusherUserId === userId && !forceNew) {
    return _pusherClient;
  }

  // Disconnect existing client if any
  if (_pusherClient) {
    _pusherClient.disconnect();
    _pusherClient = null;
  }

  _pusherUserId = userId;
  _pusherClient = new PusherClient(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
    cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    channelAuthorization: {
      endpoint: "/api/pusher/auth",
      transport: "ajax",
      params: { user_id: userId, user_name: userName },
    },
  });

  return _pusherClient;
}

export function disconnectPusherClient(): void {
  if (_pusherClient) {
    _pusherClient.disconnect();
    _pusherClient = null;
    _pusherUserId = null;
  }
}
