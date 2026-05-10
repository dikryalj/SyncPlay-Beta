/**
 * room/[code]/page.tsx — SyncPlay Room Page (Serverless Edition)
 *
 * useSearchParams() wrapped in Suspense per Next.js 14+ requirement.
 * Track type comes from @/lib/types (single source of truth).
 */

"use client";

import { Suspense, useCallback, useRef } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft, Music2, AlertCircle, Loader2 } from "lucide-react";
import AudioPlayer from "@/components/AudioPlayer";
import ParticipantsList from "@/components/ParticipantsList";
import TrackQueue from "@/components/TrackQueue";
import RoomCodeInput from "@/components/RoomCodeInput";
import { useRoom } from "@/hooks/useRoom";
import type { Track } from "@/lib/types";

function generateUserId(): string {
  return Math.random().toString(36).substring(2, 10);
}

// ── Inner component (uses useSearchParams — must be inside Suspense) ──────────

function RoomPageInner() {
  const params       = useParams();
  const searchParams = useSearchParams();
  const router       = useRouter();

  const code          = (params.code as string)?.toUpperCase() ?? "------";
  const initialIsHost = searchParams.get("host") === "true";
  const userName      = searchParams.get("name") ?? "Listener";
  const initialUrl    = searchParams.get("url") ?? "";

  // Stable random user ID for this browser session
  const userIdRef = useRef(generateUserId());

  const {
    currentTrack,
    queue,
    isPlaying,
    syncTime,
    syncVersion,
    members,
    hostUserId,
    connected,
    isAdding,
    addError,
    liveTimeRef,
    play,
    pause,
    seek,
    nextTrack,
    addToQueue,
    removeFromQueue,
    changeTrack,
    clearAddError,
  } = useRoom({ code, userId: userIdRef.current, userName, initialIsHost, initialUrl });

  const isHost = hostUserId === userIdRef.current;

  // Both track-end (onEnded) and Skip Forward button call this.
  // nextTrack() dequeues the finished track from Supabase via API.
  const handleAutoNext = useCallback(() => {
    if (!isHost) return;
    nextTrack();
  }, [isHost, nextTrack]);

  // ── Track navigation ───────────────────────────────────────────────────────

  const handleNext = handleAutoNext;

  const handlePrev = useCallback(() => {
    if (!queue.length || !currentTrack) return;
    const idx  = queue.findIndex((t) => t.id === currentTrack.id);
    const prev = queue[(idx - 1 + queue.length) % queue.length];
    if (prev) changeTrack(prev);
  }, [queue, currentTrack, changeTrack]);

  const handleTrackSelect = useCallback(
    (id: string) => {
      if (!isHost) return;
      const t = queue.find((x) => x.id === id);
      if (t) changeTrack(t);
    },
    [queue, isHost, changeTrack]
  );

  // AudioPlayer expects its own Track shape; since @/lib/types Track is
  // structurally identical we can safely cast.
  const playerTrack = currentTrack as Parameters<typeof AudioPlayer>[0]["track"];

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
      <div className="glow-orb glow-orb-violet fixed" style={{ width: 500, height: 500, top: -100, left: -100, opacity: 0.3, zIndex: 0 }} />
      <div className="glow-orb glow-orb-cyan fixed"   style={{ width: 350, height: 350, bottom: -80, right: -80, opacity: 0.2, zIndex: 0 }} />

      <div className="relative z-10">
        {/* Header */}
        <header className="glass sticky top-0 z-30" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <div className="container-app flex items-center justify-between h-16 gap-4">
            <button className="btn-icon" onClick={() => router.push("/")} aria-label="Back to home">
              <ArrowLeft size={18} />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, var(--brand-violet), #4F46E5)" }}>
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
                  background: connected ? "#4ADE80" : "#F59E0B",
                  boxShadow:  connected ? "0 0 8px #4ADE80" : "0 0 8px #F59E0B",
                  transition: "all 0.4s",
                }}
              />
              <span className="text-sm hidden sm:inline" style={{ color: "var(--text-muted)" }}>
                {connected ? "Connected" : "Connecting…"}
              </span>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="container-app py-8">
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <div
              className="grid gap-6"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", alignItems: "start" }}
            >
              {/* Left: room code + player */}
              <div className="flex flex-col gap-5">
                <RoomCodeInput code={code} />
                <AudioPlayer
                  track={playerTrack}
                  isHost={isHost}
                  isPlaying={isPlaying}
                  syncTime={syncTime}
                  syncVersion={syncVersion}
                  syncThresholdSeconds={0.5}
                  onPlay={()  => play(liveTimeRef.current)}
                  onPause={()  => pause(liveTimeRef.current)}
                  onSeek={seek}
                  onNext={handleNext}
                  onPrev={handlePrev}
                  onCurrentTime={(t) => { liveTimeRef.current = t; }}
                />
              </div>

              {/* Right: participants + queue */}
              <div className="flex flex-col gap-5">
                <ParticipantsList
                  participants={members}
                  currentUserId={userIdRef.current}
                />
                <TrackQueue
                  queue={queue as Track[]}
                  currentTrackId={currentTrack?.id}
                  isHost={isHost}
                  isAdding={isAdding}
                  addError={addError}
                  onAdd={addToQueue}
                  onRemove={removeFromQueue}
                  onClearError={clearAddError}
                  onSelect={handleTrackSelect}
                />
              </div>
            </div>

            {/* Connecting banner */}
            {!connected && (
              <div
                className="mt-6 p-4 rounded-xl flex items-start gap-3 animate-fade-up"
                style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}
              >
                <AlertCircle size={16} style={{ color: "#F59E0B", flexShrink: 0, marginTop: 2 }} />
                <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                  <strong style={{ color: "#F59E0B" }}>Connecting to room…</strong>{" "}
                  Establishing real-time sync via Pusher Channels.
                </p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

// ── Fallback skeleton ──────────────────────────────────────────────────────────

function RoomSkeleton() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
      <div className="flex flex-col items-center gap-4">
        <Loader2 size={32} className="animate-spin" style={{ color: "var(--brand-violet-light)" }} />
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Loading room…</p>
      </div>
    </div>
  );
}

// ── Default export wrapped in Suspense ────────────────────────────────────────

export default function RoomPage() {
  return (
    <Suspense fallback={<RoomSkeleton />}>
      <RoomPageInner />
    </Suspense>
  );
}
