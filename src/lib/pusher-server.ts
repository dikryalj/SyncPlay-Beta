/**
 * pusher-server.ts — Server-side Pusher trigger client.
 * ONLY import this from API Routes / Server Components.
 * Never import in client components or hooks.
 */

import Pusher from "pusher";

export function getPusherServer(): Pusher {
  return new Pusher({
    appId:   process.env.PUSHER_APP_ID!,
    key:     process.env.NEXT_PUBLIC_PUSHER_KEY!,
    secret:  process.env.PUSHER_SECRET!,
    cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    useTLS:  true,
  });
}
