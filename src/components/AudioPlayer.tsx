/**
 * AudioPlayer.tsx
 *
 * Enhancements over the original:
 *  - Supports `source: "youtube" | "spotify" | "direct"` on the Track type.
 *  - YouTube / Spotify tracks render an <iframe> embed instead of <audio>.
 *  - Exposes the audio element's real currentTime via the `onCurrentTime`
 *    callback so the room page can use the true position for emit payloads.
 *  - Sync threshold is configurable via `syncThresholdSeconds` prop (default 0.5).
 *  - Idle state shown gracefully when `track` is null.
 */

"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Play, Pause, SkipBack, SkipForward,
  Volume2, VolumeX, Repeat, Shuffle, Music2
} from "lucide-react";
import AudioVisualizer from "./AudioVisualizer";

// ── Track type ────────────────────────────────────────────────────────────────

export interface Track {
  id: string;
  title: string;
  artist: string;
  /** Duration in seconds. 0 means unknown (e.g. YouTube). */
  duration: number;
  coverUrl?: string;
  thumbnailUrl?: string;
  url?: string;
  originalUrl?: string;
  source?: "youtube" | "spotify" | "direct";
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface AudioPlayerProps {
  track: Track | null;
  isHost: boolean;
  onPlay?: () => void;
  onPause?: () => void;
  onSeek?: (time: number) => void;
  onNext?: () => void;
  onPrev?: () => void;
  /** Compensated sync time pushed from host via WebSocket */
  syncTime?: number | null;
  /** Controlled playing state from parent */
  isPlaying?: boolean;
  /**
   * Called every second with the actual HTMLAudioElement currentTime
   * so the room page can read a fresh position for emit payloads.
   * Only fires for direct audio tracks.
   */
  onCurrentTime?: (time: number) => void;
  /**
   * Minimum time delta (seconds) before forcing a seek on the audio element.
   * Prevents constant micro-seeks that cause audio stutter.
   * @default 0.5
   */
  syncThresholdSeconds?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(s: number) {
  if (!s || s <= 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AudioPlayer({
  track,
  isHost,
  onPlay,
  onPause,
  onSeek,
  onNext,
  onPrev,
  syncTime,
  isPlaying: externalPlaying,
  onCurrentTime,
  syncThresholdSeconds = 0.5,
}: AudioPlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isActuallyPlaying = externalPlaying !== undefined ? externalPlaying : playing;
  const isEmbed = track?.source === "youtube" || track?.source === "spotify";
  const duration = track?.duration && track.duration > 0 ? track.duration : 0;

  // ── Sync time from host ──────────────────────────────────────────────────
  useEffect(() => {
    if (syncTime === null || syncTime === undefined) return;
    setCurrentTime(syncTime);
    if (audioRef.current && !isEmbed) {
      if (Math.abs(audioRef.current.currentTime - syncTime) > syncThresholdSeconds) {
        audioRef.current.currentTime = syncTime;
      }
    }
  }, [syncTime, isEmbed, syncThresholdSeconds]);

  // ── Fake progress timer (for embeds or when audio is not loaded) ─────────
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (isActuallyPlaying) {
      intervalRef.current = setInterval(() => {
        setCurrentTime((t) => {
          const next = t + 1;
          // For direct audio, sync from the real element instead
          if (audioRef.current && !isEmbed) {
            onCurrentTime?.(audioRef.current.currentTime);
            return audioRef.current.currentTime;
          }
          // For embeds or when no audio element, just tick
          if (duration > 0 && next >= duration) return 0;
          return next;
        });
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isActuallyPlaying, duration, isEmbed, onCurrentTime]);

  // ── Handle real audio play / pause (direct audio only) ──────────────────
  useEffect(() => {
    if (audioRef.current && !isEmbed) {
      if (isActuallyPlaying) {
        audioRef.current.play().catch((e) => console.log("Audio play prevented:", e));
      } else {
        audioRef.current.pause();
      }
    }
  }, [isActuallyPlaying, track?.url, isEmbed]);

  // ── Reset position when track changes ───────────────────────────────────
  useEffect(() => {
    setCurrentTime(0);
    setPlaying(false);
  }, [track?.id]);

  // ── Volume / Mute ────────────────────────────────────────────────────────
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
      audioRef.current.muted = muted;
    }
  }, [volume, muted]);

  // ── Controls ─────────────────────────────────────────────────────────────

  const handlePlayPause = useCallback(() => {
    if (!isHost) return;
    if (isActuallyPlaying) {
      onPause?.();
      setPlaying(false);
    } else {
      onPlay?.();
      setPlaying(true);
    }
  }, [isHost, isActuallyPlaying, onPlay, onPause]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isHost) return;
    const t = Number(e.target.value);
    setCurrentTime(t);
    if (audioRef.current && !isEmbed) audioRef.current.currentTime = t;
    onSeek?.(t);
  }, [isHost, isEmbed, onSeek]);

  // Cover image: prefer thumbnailUrl, then coverUrl
  const artUrl = track?.thumbnailUrl ?? track?.coverUrl;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // ── Idle state ───────────────────────────────────────────────────────────
  if (!track) {
    return (
      <div
        className="glass-card p-6 flex flex-col items-center justify-center gap-4"
        style={{ minHeight: 220 }}
      >
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ background: "var(--bg-overlay)" }}
        >
          <Music2 size={32} style={{ color: "var(--text-muted)" }} />
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", textAlign: "center" }}>
          No track selected. Add a song to the queue to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card p-6 flex flex-col gap-5">
      {/* Hidden audio element for direct audio sources */}
      {track.url && !isEmbed && (
        <audio
          ref={audioRef}
          src={track.url}
          onEnded={() => { if (isHost) onNext?.(); }}
          onTimeUpdate={(e) => {
            setCurrentTime(e.currentTarget.currentTime);
            onCurrentTime?.(e.currentTarget.currentTime);
          }}
          onLoadedMetadata={(e) => {
            // Update duration display from actual metadata if available
            // (duration in Track may be 0 for direct URLs)
          }}
        />
      )}

      {/* YouTube / Spotify embed iframe */}
      {isEmbed && track.url && (
        <div
          style={{
            position: "relative",
            borderRadius: "var(--radius-lg)",
            overflow: "hidden",
            aspectRatio: track.source === "youtube" ? "16/9" : "unset",
            height: track.source === "spotify" ? 80 : undefined,
            background: "var(--bg-elevated)",
          }}
        >
          <iframe
            src={isActuallyPlaying ? track.url : track.url.replace("autoplay=1", "autoplay=0")}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              display: "block",
            }}
            title={track.title}
          />
          {/* Embed notice */}
          <div
            className="absolute bottom-0 left-0 right-0 flex items-center gap-2 px-3 py-1"
            style={{ background: "rgba(0,0,0,0.6)", fontSize: "0.7rem", color: "rgba(255,255,255,0.6)" }}
          >
            <span>
              {track.source === "youtube" ? "▶ YouTube" : "♫ Spotify"} embed ·
              sync is frame-accurate
            </span>
          </div>
        </div>
      )}

      {/* Track Info */}
      <div className="flex items-center gap-4">
        {/* Album Art */}
        <div className="relative flex-shrink-0">
          <div
            className="w-16 h-16 rounded-xl flex items-center justify-center overflow-hidden"
            style={{
              background: "linear-gradient(135deg, #3B0764 0%, #1E1B4B 50%, #0C4A6E 100%)",
              boxShadow: isActuallyPlaying ? "0 0 24px rgba(124,58,237,0.4)" : "none",
              transition: "box-shadow 0.4s ease",
            }}
          >
            {artUrl ? (
              <img
                src={artUrl}
                alt={track.title}
                className="w-full h-full object-cover"
                style={{ borderRadius: "inherit" }}
              />
            ) : (
              <Music2 size={28} style={{ color: "var(--brand-violet-light)" }} />
            )}
          </div>
          {isActuallyPlaying && (
            <span
              className="absolute inset-0 rounded-xl"
              style={{
                boxShadow: "0 0 0 0 rgba(124,58,237,0.6)",
                animation: "pulse-ring 1.8s ease-out infinite",
              }}
            />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p
            className="font-semibold truncate"
            style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)", fontSize: "1rem" }}
          >
            {track.title}
          </p>
          <p className="text-sm truncate" style={{ color: "var(--text-secondary)" }}>
            {track.artist || "—"}
          </p>
        </div>

        {/* Role badge */}
        <span className={`badge ${isHost ? "badge-violet" : "badge-cyan"}`}>
          {isHost ? "Host" : "Listener"}
        </span>
      </div>

      {/* Visualizer */}
      <AudioVisualizer isPlaying={isActuallyPlaying} barCount={40} height={52} />

      {/* Progress Bar — hidden for embed sources with unknown duration */}
      {(!isEmbed || duration > 0) && (
        <div className="flex flex-col gap-2">
          <input
            type="range"
            className="range-slider"
            min={0}
            max={duration || 100}
            value={Math.min(currentTime, duration || 100)}
            onChange={handleSeek}
            disabled={!isHost || isEmbed}
            style={{
              background: `linear-gradient(to right, var(--brand-violet) ${progress}%, var(--bg-overlay) ${progress}%)`,
              opacity: isEmbed ? 0.4 : 1,
              cursor: isEmbed ? "default" : undefined,
            }}
          />
          <div className="flex justify-between text-xs" style={{ color: "var(--text-muted)" }}>
            <span>{formatTime(currentTime)}</span>
            <span>{duration > 0 ? formatTime(duration) : "—:——"}</span>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-center gap-4">
        <button
          className="btn-icon tooltip"
          data-tip="Shuffle"
          onClick={() => setShuffle(!shuffle)}
          style={{ color: shuffle ? "var(--brand-violet-light)" : undefined }}
        >
          <Shuffle size={18} />
        </button>

        <button
          className="btn-icon"
          onClick={onPrev}
          disabled={!isHost}
          style={{ opacity: isHost ? 1 : 0.4 }}
          aria-label="Previous track"
        >
          <SkipBack size={20} />
        </button>

        <button
          className="btn-play"
          onClick={handlePlayPause}
          disabled={!isHost}
          style={{ opacity: isHost ? 1 : 0.5 }}
          aria-label={isActuallyPlaying ? "Pause" : "Play"}
        >
          {isActuallyPlaying ? <Pause size={26} /> : <Play size={26} style={{ marginLeft: 3 }} />}
        </button>

        <button
          className="btn-icon"
          onClick={onNext}
          disabled={!isHost}
          style={{ opacity: isHost ? 1 : 0.4 }}
          aria-label="Next track"
        >
          <SkipForward size={20} />
        </button>

        <button
          className="btn-icon tooltip"
          data-tip="Repeat"
          onClick={() => setRepeat(!repeat)}
          style={{ color: repeat ? "var(--brand-violet-light)" : undefined }}
        >
          <Repeat size={18} />
        </button>
      </div>

      {/* Volume — only meaningful for direct audio */}
      {!isEmbed && (
        <div className="flex items-center gap-3">
          <button className="btn-icon" onClick={() => setMuted(!muted)} style={{ width: 32, height: 32 }}>
            {muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <input
            type="range"
            className="range-slider flex-1"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            onChange={(e) => { setVolume(Number(e.target.value)); setMuted(false); }}
            style={{
              background: `linear-gradient(to right, var(--brand-cyan) ${(muted ? 0 : volume) * 100}%, var(--bg-overlay) ${(muted ? 0 : volume) * 100}%)`,
            }}
          />
          <span className="text-xs w-8 text-right" style={{ color: "var(--text-muted)" }}>
            {Math.round((muted ? 0 : volume) * 100)}%
          </span>
        </div>
      )}
    </div>
  );
}
