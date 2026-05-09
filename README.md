# SyncPlay Beta 🎵

SyncPlay Beta is a real-time, synchronized audio playback platform. It allows multiple users to join a virtual room and listen to the same audio track in perfect synchronization, with sub-50ms latency compensation.

## Features ✨
- **Real-Time Synchronization**: Audio is kept perfectly in sync across all devices in a room using a custom NTP-style latency compensation algorithm.
- **Dynamic Host Promotion**: If the host disconnects, the next available participant is automatically promoted to host.
- **Live Debug Panel**: Monitor socket connection health, real-time RTT (Round Trip Time), and event logs via the `/debug` route.
- **Embedded Player**: Supports direct audio URLs, YouTube embeds, and Spotify embeds.
- **Server-Side URL Validation**: Prevents invalid media from breaking the room.

## Technology Stack 🛠️
- **Frontend**: Next.js 14+ (App Router), React, Tailwind CSS, Lucide Icons.
- **Backend**: Custom Node.js server with `Socket.io` for real-time bidirectional event streaming.
- **State Management**: In-memory Map (for room states) with optimistic UI updates.

## Getting Started 🚀

### 1. Local Development
Since this project requires a persistent WebSocket connection, you need to run the custom `server.ts` instead of the default Next.js server.

```bash
# Install dependencies
npm install

# Run the development server
npm run dev
```
Access the app at `http://localhost:3000`.

### 2. Deployment
Because this project relies on a stateful `Socket.io` backend, **standard Vercel deployment will not work for the backend** (Vercel uses Serverless functions which don't support long-lived WebSockets).

**Recommended Deployment: VPS or Render/Railway**
Deploy the entire project (Frontend + Backend) to a platform that supports long-running Node.js processes, such as a VPS, Render, or Railway.

If you must use Vercel for the frontend, you will need to host the Socket server separately and configure the frontend to connect to it by setting the `NEXT_PUBLIC_SOCKET_URL` environment variable.

## Disclaimer
This is a Beta version. Features and optimizations are ongoing.
