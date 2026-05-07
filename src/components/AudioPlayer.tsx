"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Play, Pause, SkipBack, SkipForward,
  Volume2, VolumeX, Repeat, Shuffle, Music2
} from "lucide-react";
import AudioVisualizer from "./AudioVisualizer";

export interface Track {
  id: string;
  title: string;
  artist: string;
  duration: number; // seconds
  coverUrl?: string;
  url?: string;
}

interface AudioPlayerProps {
  track: Track | null;
  isHost: boolean;
  onPlay?: () => void;
  onPause?: () => void;
  onSeek?: (time: number) => void;
  onNext?: () => void;
  onPrev?: () => void;
  syncTime?: number | null;
  isPlaying?: boolean;
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

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
}: AudioPlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isActuallyPlaying = externalPlaying !== undefined ? externalPlaying : playing;
  const duration = track?.duration ?? 240;

  // Sync time from host
  useEffect(() => {
    if (syncTime !== null && syncTime !== undefined) {
      setCurrentTime(syncTime);
    }
  }, [syncTime]);

  // Timer for progress
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (isActuallyPlaying) {
      intervalRef.current = setInterval(() => {
        setCurrentTime((t) => {
          if (t >= duration) { return 0; }
          return t + 1;
        });
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isActuallyPlaying, duration]);

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
    onSeek?.(t);
  }, [isHost, onSeek]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="glass-card p-6 flex flex-col gap-5">
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
            {track?.coverUrl ? (
              <img
                src={track.coverUrl}
                alt={track.title}
                className="w-full h-full object-cover"
                style={{ borderRadius: "inherit" }}
              />
            ) : (
              <Music2 size={28} style={{ color: "var(--brand-violet-light)" }} />
            )}
          </div>
          {/* Pulse ring when playing */}
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
            {track?.title ?? "No track selected"}
          </p>
          <p className="text-sm truncate" style={{ color: "var(--text-secondary)" }}>
            {track?.artist ?? "—"}
          </p>
        </div>

        {/* Role badge */}
        <span className={`badge ${isHost ? "badge-violet" : "badge-cyan"}`}>
          {isHost ? "Host" : "Listener"}
        </span>
      </div>

      {/* Visualizer */}
      <AudioVisualizer isPlaying={isActuallyPlaying} barCount={40} height={52} />

      {/* Progress Bar */}
      <div className="flex flex-col gap-2">
        <input
          type="range"
          className="range-slider"
          min={0}
          max={duration}
          value={currentTime}
          onChange={handleSeek}
          disabled={!isHost}
          style={{
            background: `linear-gradient(to right, var(--brand-violet) ${progress}%, var(--bg-overlay) ${progress}%)`,
          }}
        />
        <div className="flex justify-between text-xs" style={{ color: "var(--text-muted)" }}>
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

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

      {/* Volume */}
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
    </div>
  );
}
