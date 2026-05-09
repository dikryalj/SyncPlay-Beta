/**
 * room/[code]/page.tsx
 *
 * Enhancements over original:
 *  - Late-joiner sync: applies currentTime + isPlaying from room-state on connect.
 *  - Latency compensation: all syncTime values are passed through compensate().
 *  - host-changed: listens for server promotion, updates local isHost state.
 *  - handleQueueAdd: uses QUEUE_ADD_VALIDATED event + tracks loading/error state.
 *  - handleNext / handlePrev: empty-queue guard (early return if queue.length === 0).
 *  - Play/Pause/Seek payloads include clientTs for server-side accounting.
 *  - setRoomContext / clearRoomContext keep the socket's reconnect handler
 *    up to date with the current room membership.
 *  - onCurrentTime callback from AudioPlayer feeds a ref so emit payloads
 *    always carry the freshest audio position, not a potentially stale state value.
 */

"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft, Music2, AlertCircle } from "lucide-react";
import AudioPlayer, { Track } from "@/components/AudioPlayer";
import ParticipantsList, { Participant } from "@/components/ParticipantsList";
import TrackQueue from "@/components/TrackQueue";
import RoomCodeInput from "@/components/RoomCodeInput";
import { getSocket, EVENTS, setRoomContext, clearRoomContext } from "@/lib/socket";
import { useLatencyCompensation } from "@/lib/latency";

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateUserId(): string {
  return Math.random().toString(36).substring(2, 10);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RoomPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const code = (params.code as string)?.toUpperCase() ?? "------";
  // isHost is mutable — can change if the original host disconnects
  const initialIsHost = searchParams.get("host") === "true";
  const userName = searchParams.get("name") ?? "Listener";
  // Initial track URL from CreateRoomModal (optional)
  const initialUrl = searchParams.get("url") ?? "";

  const userIdRef = useRef(generateUserId());
  const [mounted, setMounted] = useState(false);
  const [connected, setConnected] = useState(false);
  const [isHost, setIsHost] = useState(initialIsHost);

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [queue, setQueue] = useState<Track[]>([]);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [syncTime, setSyncTime] = useState<number | null>(null);

  // Queue add flow
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string>("");

  // Ref to track the live audio position for emit payloads
  const liveTimeRef = useRef<number>(0);

  // ── Latency compensation ────────────────────────────────────────────────────
  const { compensate } = useLatencyCompensation(connected);

  // ── Socket setup ────────────────────────────────────────────────────────────
  useEffect(() => {
    const userId = userIdRef.current;
    setMounted(true);

    // Register room context so the socket auto-rejoins on reconnect
    setRoomContext({ roomCode: code, userId, name: userName, isHost: initialIsHost });

    let socket: ReturnType<typeof getSocket>;
    try {
      socket = getSocket();

      // ── Named handlers (needed for targeted cleanup) ──────────────────────
      const onConnect = () => {
        setConnected(true);
        // Re-emit JOIN_ROOM after reconnects (socket.on("reconnect") in
        // socket.ts handles this, but we also cover the initial connect
        // in case the socket was created before the component mounted).
        socket.emit(EVENTS.JOIN_ROOM, { roomCode: code, userId, name: userName, isHost: initialIsHost });
        // If the host provided an initial URL, submit it now
        if (initialIsHost && initialUrl) {
          socket.emit(EVENTS.QUEUE_ADD_VALIDATED, { roomCode: code, url: initialUrl, requestedBy: userName });
        }
      };
      const onDisconnect = () => setConnected(false);
      const onConnectError = () => setConnected(false);

      // ── Connection state ──────────────────────────────────────────────────
      socket.on("connect", onConnect);
      socket.on("disconnect", onDisconnect);
      socket.on("connect_error", onConnectError);

      // If socket is already connected (e.g. navigated from another room),
      // fire the join immediately without waiting for the connect event.
      if (socket.connected) {
        setConnected(true);
        socket.emit(EVENTS.JOIN_ROOM, { roomCode: code, userId, name: userName, isHost: initialIsHost });
        if (initialIsHost && initialUrl) {
          socket.emit(EVENTS.QUEUE_ADD_VALIDATED, { roomCode: code, url: initialUrl, requestedBy: userName });
        }
      }

      // ── Room state (initial sync for late joiners) ─────────────────────────
      const onRoomState = (state: {
        users: Participant[];
        queue: Track[];
        currentTrack: Track | null;
        isPlaying: boolean;
        currentTime: number;
        hostUserId: string;
      }) => {
        setParticipants(state.users ?? []);
        setQueue(state.queue ?? []);
        setCurrentTrack(state.currentTrack ?? null);
        setIsPlaying(state.isPlaying);
        // Apply latency-compensated time immediately so late joiners land at the
        // correct position without a manual seek from the host.
        if (state.currentTime > 0) {
          const compensated = state.isPlaying
            ? compensate(state.currentTime)
            : state.currentTime;
          setSyncTime(compensated);
          liveTimeRef.current = compensated;
        }
        // If this client is the host (per the server), reflect that
        if (state.hostUserId === userId) {
          setIsHost(true);
        }
      };

      // ── User join / leave ─────────────────────────────────────────────────
      const onUserJoined = (user: Participant) => {
        setParticipants((p) => {
          if (p.find((x) => x.id === user.id)) return p;
          return [...p, user];
        });
      };
      const onUserLeft = ({ userId: uid }: { userId: string }) => {
        setParticipants((p) => p.filter((x) => x.id !== uid));
      };

      // ── Host promotion ────────────────────────────────────────────────────
      const onHostChanged = ({ newHostId }: { newHostId: string }) => {
        if (newHostId === userId) {
          setIsHost(true);
          // Update room context so reconnect knows we are now host
          setRoomContext({ roomCode: code, userId, name: userName, isHost: true });
        } else {
          setIsHost(false);
        }
        // Update the participant list's isHost flag locally
        setParticipants((p) =>
          p.map((x) => ({ ...x, isHost: x.id === newHostId }))
        );
      };

      // ── Sync events ───────────────────────────────────────────────────────
      const onSyncPlay = ({ time }: { time: number; serverTs: number }) => {
        const t = compensate(time);
        setSyncTime(t);
        liveTimeRef.current = t;
        setIsPlaying(true);
      };

      const onSyncPause = ({ time }: { time: number }) => {
        setSyncTime(time);
        liveTimeRef.current = time;
        setIsPlaying(false);
      };

      const onSyncSeek = ({ time }: { time: number }) => {
        const t = compensate(time);
        setSyncTime(t);
        liveTimeRef.current = t;
      };

      const onSyncTrack = ({ track }: { track: Track }) => {
        setCurrentTrack(track);
        setSyncTime(0);
        liveTimeRef.current = 0;
        setIsPlaying(false);
      };

      // ── Queue events ──────────────────────────────────────────────────────
      const onQueueUpdate = ({ queue: q }: { queue: Track[] }) => {
        setQueue(q);
        setIsAdding(false);
      };

      // ── Error events ──────────────────────────────────────────────────────
      const onError = ({ message }: { code: string; message: string }) => {
        setAddError(message);
        setIsAdding(false);
      };

      // Register all named handlers
      socket.on(EVENTS.ROOM_STATE, onRoomState);
      socket.on(EVENTS.USER_JOINED, onUserJoined);
      socket.on(EVENTS.USER_LEFT, onUserLeft);
      socket.on(EVENTS.HOST_CHANGED, onHostChanged);
      socket.on(EVENTS.SYNC_PLAY, onSyncPlay);
      socket.on(EVENTS.SYNC_PAUSE, onSyncPause);
      socket.on(EVENTS.SYNC_SEEK, onSyncSeek);
      socket.on(EVENTS.SYNC_TRACK, onSyncTrack);
      socket.on(EVENTS.QUEUE_UPDATE, onQueueUpdate);
      socket.on(EVENTS.ERROR, onError);

      // Self-add to participants immediately (offline/demo mode fallback)
      setParticipants([{ id: userId, name: userName, isHost: initialIsHost, isOnline: true }]);

      return () => {
        // Targeted cleanup — only remove THIS component's handlers so
        // latency ping/pong and other global listeners remain intact.
        try {
          socket.emit(EVENTS.LEAVE_ROOM, { roomCode: code, userId });
        } catch { /* ignore */ }
        socket.off("connect", onConnect);
        socket.off("disconnect", onDisconnect);
        socket.off("connect_error", onConnectError);
        socket.off(EVENTS.ROOM_STATE, onRoomState);
        socket.off(EVENTS.USER_JOINED, onUserJoined);
        socket.off(EVENTS.USER_LEFT, onUserLeft);
        socket.off(EVENTS.HOST_CHANGED, onHostChanged);
        socket.off(EVENTS.SYNC_PLAY, onSyncPlay);
        socket.off(EVENTS.SYNC_PAUSE, onSyncPause);
        socket.off(EVENTS.SYNC_SEEK, onSyncSeek);
        socket.off(EVENTS.SYNC_TRACK, onSyncTrack);
        socket.off(EVENTS.QUEUE_UPDATE, onQueueUpdate);
        socket.off(EVENTS.ERROR, onError);
        clearRoomContext();
      };
    } catch {
      setConnected(false);
      setParticipants([{ id: userId, name: userName, isHost: initialIsHost, isOnline: true }]);
      return () => { clearRoomContext(); };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, userName]);

  // ── Playback controls ───────────────────────────────────────────────────────

  const handlePlay = useCallback(() => {
    setIsPlaying(true);
    try {
      getSocket().emit(EVENTS.PLAY, {
        roomCode: code,
        time: liveTimeRef.current,
        clientTs: Date.now(),
      });
    } catch { /* demo mode */ }
  }, [code]);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
    try {
      getSocket().emit(EVENTS.PAUSE, {
        roomCode: code,
        time: liveTimeRef.current,
        clientTs: Date.now(),
      });
    } catch { /* demo mode */ }
  }, [code]);

  const handleSeek = useCallback((time: number) => {
    liveTimeRef.current = time;
    setSyncTime(time);
    try {
      getSocket().emit(EVENTS.SEEK, {
        roomCode: code,
        time,
        clientTs: Date.now(),
      });
    } catch { /* demo mode */ }
  }, [code]);

  // ── Track navigation ────────────────────────────────────────────────────────

  const handleNext = useCallback(() => {
    // Guard: empty queue is a no-op
    if (queue.length === 0 || !currentTrack) return;
    const idx = queue.findIndex((t) => t.id === currentTrack.id);
    const next = queue[(idx + 1) % queue.length];
    if (!next) return;
    setCurrentTrack(next);
    setSyncTime(0);
    liveTimeRef.current = 0;
    try {
      getSocket().emit(EVENTS.TRACK_CHANGE, { roomCode: code, track: next });
    } catch { /* demo mode */ }
  }, [queue, currentTrack, code]);

  const handlePrev = useCallback(() => {
    // Guard: empty queue is a no-op
    if (queue.length === 0 || !currentTrack) return;
    const idx = queue.findIndex((t) => t.id === currentTrack.id);
    const prev = queue[(idx - 1 + queue.length) % queue.length];
    if (!prev) return;
    setCurrentTrack(prev);
    setSyncTime(0);
    liveTimeRef.current = 0;
    try {
      getSocket().emit(EVENTS.TRACK_CHANGE, { roomCode: code, track: prev });
    } catch { /* demo mode */ }
  }, [queue, currentTrack, code]);

  // ── Queue management ────────────────────────────────────────────────────────

  const handleQueueAdd = useCallback((url: string) => {
    setAddError("");
    setIsAdding(true);
    try {
      getSocket().emit(EVENTS.QUEUE_ADD_VALIDATED, {
        roomCode: code,
        url,
        requestedBy: userName,
      });
    } catch {
      // Demo mode fallback: add a stub track locally
      setIsAdding(false);
      const stub: Track = {
        id: Date.now().toString(),
        title: url.length > 40 ? url.slice(0, 40) + "…" : url,
        artist: `Added by ${userName}`,
        duration: 0,
        url,
        source: "direct",
      };
      setQueue((q) => {
        const next = [...q, stub];
        if (!currentTrack) setCurrentTrack(stub);
        return next;
      });
    }
  }, [code, userName, currentTrack]);

  const handleQueueRemove = useCallback((id: string) => {
    setQueue((q) => q.filter((t) => t.id !== id));
    try {
      getSocket().emit(EVENTS.QUEUE_REMOVE, { roomCode: code, trackId: id });
    } catch { /* demo mode */ }
  }, [code]);

  const handleTrackSelect = useCallback((id: string) => {
    if (!isHost) return;
    const t = queue.find((x) => x.id === id);
    if (!t) return;
    setCurrentTrack(t);
    setSyncTime(0);
    liveTimeRef.current = 0;
    try {
      getSocket().emit(EVENTS.TRACK_CHANGE, { roomCode: code, track: t });
    } catch { /* demo mode */ }
  }, [queue, isHost, code]);

  if (!mounted) return null;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
      {/* Glow orbs */}
      <div className="glow-orb glow-orb-violet fixed" style={{ width: 500, height: 500, top: -100, left: -100, opacity: 0.3, zIndex: 0 }} />
      <div className="glow-orb glow-orb-cyan fixed" style={{ width: 350, height: 350, bottom: -80, right: -80, opacity: 0.2, zIndex: 0 }} />

      <div className="relative z-10">
        {/* Top bar */}
        <header className="glass sticky top-0 z-30" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <div className="container-app flex items-center justify-between h-16 gap-4">
            <button className="btn-icon" onClick={() => router.push("/")} aria-label="Back to home">
              <ArrowLeft size={18} />
            </button>

            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, var(--brand-violet), #4F46E5)" }}
              >
                <Music2 size={16} color="#fff" />
              </div>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1.1rem", color: "var(--text-primary)" }}>
                Sync<span style={{ color: "var(--brand-violet-light)" }}>Play</span>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full"
                style={{
                  background: connected ? "#4ADE80" : "#F87171",
                  boxShadow: connected ? "0 0 8px #4ADE80" : "none",
                  transition: "background 0.3s, box-shadow 0.3s",
                }}
              />
              <span className="text-sm hidden sm:inline" style={{ color: "var(--text-muted)" }}>
                {connected ? "Connected" : "Demo Mode"}
              </span>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="container-app py-8">
          <div className="grid gap-6" style={{ maxWidth: 1200, margin: "0 auto" }}>
            <div
              className="grid gap-6"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", alignItems: "start" }}
            >
              {/* Left column — room code + player */}
              <div className="flex flex-col gap-5">
                <RoomCodeInput code={code} />
                <AudioPlayer
                  track={currentTrack}
                  isHost={isHost}
                  isPlaying={isPlaying}
                  syncTime={syncTime}
                  syncThresholdSeconds={0.5}
                  onPlay={handlePlay}
                  onPause={handlePause}
                  onSeek={handleSeek}
                  onNext={handleNext}
                  onPrev={handlePrev}
                  onCurrentTime={(t) => { liveTimeRef.current = t; }}
                />
              </div>

              {/* Right column — participants + queue */}
              <div className="flex flex-col gap-5">
                <ParticipantsList
                  participants={participants}
                  currentUserId={userIdRef.current}
                />
                <TrackQueue
                  queue={queue}
                  currentTrackId={currentTrack?.id}
                  isHost={isHost}
                  isAdding={isAdding}
                  addError={addError}
                  onAdd={handleQueueAdd}
                  onRemove={handleQueueRemove}
                  onClearError={() => setAddError("")}
                  onSelect={handleTrackSelect}
                />
              </div>
            </div>

            {/* Demo / offline notice */}
            {!connected && (
              <div
                className="p-4 rounded-xl flex items-start gap-3 animate-fade-up"
                style={{ background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.2)" }}
              >
                <AlertCircle size={16} style={{ color: "var(--brand-violet-light)", flexShrink: 0, marginTop: 2 }} />
                <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                  <strong style={{ color: "var(--brand-violet-light)" }}>Demo Mode</strong> — WebSocket server is not running.
                  Start the server with{" "}
                  <code style={{ background: "var(--bg-elevated)", padding: "1px 6px", borderRadius: 4, fontSize: "0.8rem" }}>
                    npm run dev
                  </code>{" "}
                  to enable real-time sync across devices. URL validation will fall back to a local stub.
                </p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
