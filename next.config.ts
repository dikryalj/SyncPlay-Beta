import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable Turbopack (Next.js 16 default).
  // Server/client bundle separation for Pusher is handled by the
  // pusher-server.ts / pusher-client.ts file split — no webpack hacks needed.
  turbopack: {},
};

export default nextConfig;
