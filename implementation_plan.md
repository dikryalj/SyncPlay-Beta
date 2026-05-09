# SyncPlay Backend Refactor — Implementation Plan

## Overview

After auditing the codebase I've identified a solid existing foundation (Socket.io server, event-driven client, AudioPlayer, TrackQueue, room state). The tasks below are **targeted improvements** — not a rewrite. Every deliverable maps to a specific file/function gap in the current code.

---

## Gaps Found in Current Code

| Area | Current State | Gap |
|---|---|---|
| Queue `addToQueue` | Raw URL string pasted directly, metadata faked with random duration | No URL validation, no metadata extraction, no YouTube/Spotify handling |
| Empty queue | Shows an idle card correctly ✅ | `handleNext/handlePrev` crashes if `queue.length === 0` (index wraps to -1) |
| Play/Pause/Seek events | Emits `time` only | Missing server-side `timestamp` and `actionType` in payload |
| Latency compensation | `syncTime` applied verbatim to audio element | No RTT measurement used to adjust the target seek time |
| Late-joiner sync | `room-state` sends `getEstimatedTime()` correctly ✅ | Client ignores the `currentTime` in `room-state` on first connect |
| Reconnection | `socket.on("connect")` sets flag but never re-joins room | After reconnect, socket is in no rooms — no re-sync |
| Invalid URL handling | Silent ignore / garbled title | No validation, no user-facing error |
| Host promotion | On `disconnect`, host role is never transferred | Room stays in limbo if host leaves |

---

## Proposed Changes

### 1. New Utility — `src/lib/urlParser.ts` [NEW]

Universal URL parser / metadata extractor.

- `parseTrackUrl(url: string): Promise<ParsedTrack | null>` — validates & routes:
  - **YouTube** → extracts `videoId` via regex, builds `youtube-nocookie` embed URL, calls `youtube-oembed` API for title/thumbnail
  - **Spotify** → detects `open.spotify.com/track/*`, returns metadata stub + a note that direct audio is behind auth (returns preview URL field when available)
  - **Direct Audio** → validates Content-Type or extension (`.mp3`, `.ogg`, `.wav`, `.flac`, `.m4a`, `audio/*`)
  - **Invalid** → returns `null` with a typed `reason` string
- Returns a fully-typed `ParsedTrack` that extends `Track` with `source: "youtube" | "spotify" | "direct"` and `thumbnailUrl`

> [!IMPORTANT]
> YouTube audio requires a server-side proxy/extractor (yt-dlp) for direct playback — we will document this clearly and use the embed URL as a progressive enhancement. The `<audio>` element does not support YouTube links natively. For this PR the player will render a YouTube embed `<iframe>` when `source === "youtube"`.

---

### 2. Enhanced Server Events — `server.ts` [MODIFY]

#### Richer payloads
All `play`, `pause`, `seek` events will now include:
```ts
{ roomCode, time, serverTimestamp: Date.now(), actionType: "play" | "pause" | "seek" }
```
Broadcasts will mirror the same shape back.

#### Host promotion on disconnect
When the host socket disconnects, promote the next online user to host and emit a `host-changed` event.

#### Queue validation
Add a `queue-add-validated` event that accepts a raw URL, runs `parseTrackUrl` server-side, and either:
- Emits `queue-update` with the enriched track on success
- Emits `error` back to the requesting socket on failure

#### Reconnection re-join helper
On `reconnect` (client-side), re-emit `join-room` with the same `userId`. Server will check `room.users.has(userId)` and update the socket reference rather than adding a duplicate user.

---

### 3. Latency Compensation — `src/lib/latency.ts` [NEW]

RTT-based sync correction hook `useLatencyCompensation()`:

```
RTT = pong.serverTs - ping.ts           // round trip in ms (server reflects ts)
clockOffset = pong.serverTs - Date.now() // rough server↔client clock delta  
compensatedTarget = syncTime + RTT / 2 / 1000  // advance by half-RTT
```

- Sends a `ping` every 5 s and keeps a rolling window of the last 5 measurements
- Exposes `compensate(rawTime: number): number` — called before any seek operation
- Jitter smoothing: discard readings > 2× median RTT

---

### 4. Socket Client — `src/lib/socket.ts` [MODIFY]

- Add `reconnect` event handler that re-emits `join-room` with the stored `userId` / `roomCode`
- Export `setRoomContext(roomCode, userId, name, isHost)` so the reconnect handler knows what room to rejoin
- Add `EVENTS.HOST_CHANGED` and `EVENTS.QUEUE_ADD_VALIDATED` to the constants map

---

### 5. Room Page — `src/app/room/[code]/page.tsx` [MODIFY]

- **Late-joiner sync**: on `EVENTS.ROOM_STATE`, apply `currentTime` via `setSyncTime` AND apply `isPlaying` state.
- **`handleQueueAdd`**: replace fake-metadata path with a call to the new `queue-add-validated` server event + show loading/error states.
- **`handleNext/handlePrev`**: guard against empty queue with an early return.
- **Host promotion**: listen for `EVENTS.HOST_CHANGED` and update local `isHost` state.
- **`handlePlay/handlePause/handleSeek`**: read current audio time from a forwarded ref rather than `syncTime` state (which may be stale).
- **Latency compensation**: wrap `setSyncTime` in the `compensate()` function from the new hook.

---

### 6. AudioPlayer — `src/components/AudioPlayer.tsx` [MODIFY]

- Accept `source?: "youtube" | "spotify" | "direct"` in `Track`.
- When `source === "youtube"`, render a `<iframe>` embed instead of `<audio>`.
- Expose `audioRef` via `forwardRef` or a dedicated `onCurrentTime` callback so the room page can read actual playback position for emit payloads.
- The sync threshold (currently hard-coded at `0.5s`) will be configurable via a prop with a default of `0.5`.

---

### 7. TrackQueue — `src/components/TrackQueue.tsx` [MODIFY]

- Show a loading spinner in the "Add" button while the server validates the URL.
- Show an inline error message if the server returns an `error` event for the URL.
- Placeholder text updated to `"YouTube, Spotify, or direct audio URL…"`.

---

## Event Contract (updated)

```ts
// Client → Server
"play"   { roomCode, time, clientTs }
"pause"  { roomCode, time, clientTs }
"seek"   { roomCode, time, clientTs }
"queue-add-validated" { roomCode, url, requestedBy }

// Server → Client
"sync-play"  { time, serverTs, actionType: "play" }
"sync-pause" { time, serverTs, actionType: "pause" }
"sync-seek"  { time, serverTs, actionType: "seek" }
"host-changed" { newHostId }
"error"      { code: "INVALID_URL" | "UNSUPPORTED_SOURCE" | ..., message: string }
```

---

## File Summary

| File | Action | Key Change |
|---|---|---|
| `src/lib/urlParser.ts` | **NEW** | URL validation + metadata extraction |
| `src/lib/latency.ts` | **NEW** | RTT-based latency compensation hook |
| `src/lib/socket.ts` | **MODIFY** | Reconnect re-join, new event constants |
| `server.ts` | **MODIFY** | Richer payloads, host promotion, server-side URL validation, reconnect handling |
| `src/app/room/[code]/page.tsx` | **MODIFY** | Late-joiner sync, latency hook, queue error handling, empty queue guard |
| `src/components/AudioPlayer.tsx` | **MODIFY** | YouTube iframe fallback, exposed ref, configurable sync threshold |
| `src/components/TrackQueue.tsx` | **MODIFY** | Loading/error states, updated placeholder |

---

## Verification Plan

### Automated (manual functional test script)
```
npm run dev
```
1. Open two browser tabs as Host and Listener in the same room.
2. Host presses Play → verify Listener tab starts at same timestamp within 500ms.
3. Host seeks to 0:30 → verify Listener seeks within 500ms.
4. Add a valid YouTube URL → verify metadata shown (title, thumbnail).
5. Add an invalid URL → verify inline error message, no crash.
6. Close Host tab (simulate disconnect) → verify Listener is promoted to host.
7. Refresh Listener tab (simulate reconnect) → verify auto-sync resumes.

### Manual
- Verify empty queue shows idle state without console errors.
- Verify `handleNext` with 0 tracks in queue is a no-op.

---

## Open Questions

> [!IMPORTANT]
> **YouTube Audio**: Browsers cannot play YouTube audio via `<audio src="...">`. The plan is to render a `<iframe>` embed when `source === "youtube"`. This means the YouTube player is **not** controlled by our Web Audio API — sync will be frame-accurate but not sub-50ms. A true sub-50ms solution requires a server-side yt-dlp proxy that streams raw audio. Should I implement the proxy, or is the iframe embed acceptable for now?

> [!NOTE]
> **Spotify**: Spotify's Web API requires OAuth and their preview URLs are 30-second clips only. Full track playback requires the Spotify Web Playback SDK (premium account). For now the plan is to detect Spotify URLs, fetch preview metadata, and play the 30s preview. Is this acceptable?
