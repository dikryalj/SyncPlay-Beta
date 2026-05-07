"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft, Music2, AlertCircle } from "lucide-react";
import AudioPlayer, { Track } from "@/components/AudioPlayer";
import ParticipantsList, { Participant } from "@/components/ParticipantsList";
import TrackQueue from "@/components/TrackQueue";
import RoomCodeInput from "@/components/RoomCodeInput";
import { getSocket, EVENTS } from "@/lib/socket";

const DEMO_TRACKS: Track[] = [
  { id: "1", title: "Neon Dreams", artist: "Synthwave Collective", duration: 214 },
  { id: "2", title: "Electric Pulse", artist: "DJ Shadow Protocol", duration: 187 },
  { id: "3", title: "Midnight Circuit", artist: "Axiom", duration: 253 },
  { id: "4", title: "Violet Horizon", artist: "Parallax Wave", duration: 198 },
];

function generateUserId() {
  return Math.random().toString(36).substring(2, 10);
}

export default function RoomPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const code = (params.code as string)?.toUpperCase() ?? "------";
  const isHost = searchParams.get("host") === "true";
  const userName = searchParams.get("name") ?? "Listener";

  const userIdRef = useRef(generateUserId());
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");

  const [participants, setParticipants] = useState<Participant[]>([
    { id: userIdRef.current, name: userName, isHost, isOnline: true },
  ]);
  const [queue, setQueue] = useState<Track[]>(DEMO_TRACKS);
  const [currentTrack, setCurrentTrack] = useState<Track>(DEMO_TRACKS[0]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [syncTime, setSyncTime] = useState<number | null>(null);

  // Socket connection
  useEffect(() => {
    let socket: ReturnType<typeof getSocket>;
    try {
      socket = getSocket();
      socket.emit(EVENTS.JOIN_ROOM, { roomCode: code, userId: userIdRef.current, name: userName, isHost });

      socket.on("connect", () => setConnected(true));
      socket.on("disconnect", () => setConnected(false));
      socket.on("connect_error", () => {
        // Demo mode — no server, still show UI
        setConnected(false);
      });

      socket.on(EVENTS.USER_JOINED, (user: Participant) => {
        setParticipants((p) => {
          if (p.find((x) => x.id === user.id)) return p;
          return [...p, user];
        });
      });

      socket.on(EVENTS.USER_LEFT, ({ userId }: { userId: string }) => {
        setParticipants((p) => p.filter((x) => x.id !== userId));
      });

      socket.on(EVENTS.SYNC_PLAY, ({ time }: { time: number }) => {
        setSyncTime(time);
        setIsPlaying(true);
      });

      socket.on(EVENTS.SYNC_PAUSE, ({ time }: { time: number }) => {
        setSyncTime(time);
        setIsPlaying(false);
      });

      socket.on(EVENTS.SYNC_SEEK, ({ time }: { time: number }) => {
        setSyncTime(time);
      });

      socket.on(EVENTS.SYNC_TRACK, ({ track }: { track: Track }) => {
        setCurrentTrack(track);
        setSyncTime(0);
      });

      socket.on(EVENTS.QUEUE_UPDATE, ({ queue: q }: { queue: Track[] }) => {
        setQueue(q);
      });
    } catch {
      setConnected(false);
    }

    return () => {
      try {
        socket?.emit(EVENTS.LEAVE_ROOM, { roomCode: code, userId: userIdRef.current });
        socket?.off();
      } catch { /* ignore */ }
    };
  }, [code, userName, isHost]);

  const handlePlay = useCallback(() => {
    setIsPlaying(true);
    try {
      getSocket().emit(EVENTS.PLAY, { roomCode: code, time: syncTime ?? 0 });
    } catch { /* demo mode */ }
  }, [code, syncTime]);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
    try {
      getSocket().emit(EVENTS.PAUSE, { roomCode: code, time: syncTime ?? 0 });
    } catch { /* demo mode */ }
  }, [code, syncTime]);

  const handleSeek = useCallback((time: number) => {
    setSyncTime(time);
    try {
      getSocket().emit(EVENTS.SEEK, { roomCode: code, time });
    } catch { /* demo mode */ }
  }, [code]);

  const handleNext = useCallback(() => {
    const idx = queue.findIndex((t) => t.id === currentTrack.id);
    const next = queue[(idx + 1) % queue.length];
    setCurrentTrack(next);
    setSyncTime(0);
    try {
      getSocket().emit(EVENTS.TRACK_CHANGE, { roomCode: code, track: next });
    } catch { /* demo mode */ }
  }, [queue, currentTrack, code]);

  const handlePrev = useCallback(() => {
    const idx = queue.findIndex((t) => t.id === currentTrack.id);
    const prev = queue[(idx - 1 + queue.length) % queue.length];
    setCurrentTrack(prev);
    setSyncTime(0);
    try {
      getSocket().emit(EVENTS.TRACK_CHANGE, { roomCode: code, track: prev });
    } catch { /* demo mode */ }
  }, [queue, currentTrack, code]);

  const handleQueueAdd = useCallback((url: string) => {
    const newTrack: Track = {
      id: Date.now().toString(),
      title: url.length > 40 ? url.slice(0, 40) + "…" : url,
      artist: "Added by " + userName,
      duration: 180 + Math.floor(Math.random() * 120),
      url,
    };
    const next = [...queue, newTrack];
    setQueue(next);
    try {
      getSocket().emit(EVENTS.QUEUE_ADD, { roomCode: code, track: newTrack });
    } catch { /* demo mode */ }
  }, [queue, code, userName]);

  const handleQueueRemove = useCallback((id: string) => {
    const next = queue.filter((t) => t.id !== id);
    setQueue(next);
    try {
      getSocket().emit(EVENTS.QUEUE_REMOVE, { roomCode: code, trackId: id });
    } catch { /* demo mode */ }
  }, [queue, code]);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
      {/* Glow orbs */}
      <div className="glow-orb glow-orb-violet fixed" style={{ width: 500, height: 500, top: -100, left: -100, opacity: 0.3, zIndex: 0 }} />
      <div className="glow-orb glow-orb-cyan fixed" style={{ width: 350, height: 350, bottom: -80, right: -80, opacity: 0.2, zIndex: 0 }} />

      <div className="relative z-10">
        {/* Top bar */}
        <header
          className="glass sticky top-0 z-30"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <div className="container-app flex items-center justify-between h-16 gap-4">
            <button
              className="btn-icon"
              onClick={() => router.push("/")}
              aria-label="Back to home"
            >
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
                style={{ background: connected ? "#4ADE80" : "#F87171", boxShadow: connected ? "0 0 8px #4ADE80" : "none" }}
              />
              <span className="text-sm hidden sm:inline" style={{ color: "var(--text-muted)" }}>
                {connected ? "Connected" : "Demo Mode"}
              </span>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="container-app py-8">
          {error && (
            <div className="flex items-center gap-3 p-4 rounded-xl mb-6 animate-fade-up" style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)" }}>
              <AlertCircle size={18} style={{ color: "#F87171" }} />
              <p style={{ color: "#F87171", margin: 0, fontSize: "0.9rem" }}>{error}</p>
            </div>
          )}

          <div className="grid gap-6" style={{ gridTemplateColumns: "1fr", maxWidth: 1200, margin: "0 auto" }}>
            {/* Mobile: stack. Desktop: 3-col grid */}
            <div
              className="grid gap-6"
              style={{
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                alignItems: "start",
              }}
            >
              {/* Left column */}
              <div className="flex flex-col gap-5">
                <RoomCodeInput code={code} />
                <AudioPlayer
                  track={currentTrack}
                  isHost={isHost}
                  isPlaying={isPlaying}
                  syncTime={syncTime}
                  onPlay={handlePlay}
                  onPause={handlePause}
                  onSeek={handleSeek}
                  onNext={handleNext}
                  onPrev={handlePrev}
                />
              </div>

              {/* Right column */}
              <div className="flex flex-col gap-5">
                <ParticipantsList
                  participants={participants}
                  currentUserId={userIdRef.current}
                />
                <TrackQueue
                  queue={queue}
                  currentTrackId={currentTrack.id}
                  isHost={isHost}
                  onAdd={handleQueueAdd}
                  onRemove={handleQueueRemove}
                  onSelect={(id) => {
                    const t = queue.find((x) => x.id === id);
                    if (t && isHost) { setCurrentTrack(t); setSyncTime(0); }
                  }}
                />
              </div>
            </div>

            {/* Demo notice */}
            {!connected && (
              <div
                className="p-4 rounded-xl flex items-start gap-3 animate-fade-up"
                style={{ background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.2)" }}
              >
                <AlertCircle size={16} style={{ color: "var(--brand-violet-light)", flexShrink: 0, marginTop: 2 }} />
                <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                  <strong style={{ color: "var(--brand-violet-light)" }}>Demo Mode</strong> — WebSocket server is not running.
                  Start the server with <code style={{ background: "var(--bg-elevated)", padding: "1px 6px", borderRadius: 4, fontSize: "0.8rem" }}>npm run dev</code> to enable real-time sync across devices.
                </p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
