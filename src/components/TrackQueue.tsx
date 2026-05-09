/**
 * TrackQueue.tsx
 *
 * Enhancements over the original:
 *  - Loading spinner while the server validates a submitted URL.
 *  - Inline error banner if the server rejects the URL (clears on next attempt).
 *  - Updated placeholder: "YouTube, Spotify, or direct audio URL…"
 *  - Empty queue shows an idle state without crashing.
 *  - `onAdd` now receives the raw URL; validation happens server-side.
 */

"use client";

import { useState } from "react";
import { ListMusic, Plus, ThumbsUp, Trash2, GripVertical, Music2, Loader2, AlertCircle, X } from "lucide-react";
import { Track } from "./AudioPlayer";

// ── Props ─────────────────────────────────────────────────────────────────────

interface TrackQueueProps {
  queue: Track[];
  currentTrackId?: string;
  isHost: boolean;
  /** True while the server is validating the most recently submitted URL */
  isAdding?: boolean;
  /** Error message from the server for the most recent add attempt */
  addError?: string;
  onRemove?: (id: string) => void;
  onVote?: (id: string) => void;
  /** Called with the raw URL string; validation is done server-side */
  onAdd?: (url: string) => void;
  /** Called when the user dismisses the current add error */
  onClearError?: () => void;
  onSelect?: (id: string) => void;
}

// ── Helper ────────────────────────────────────────────────────────────────────

function formatTime(s: number) {
  if (!s || s <= 0) return "—:——";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// Source badge colours
const SOURCE_COLORS: Record<string, string> = {
  youtube: "#FF0000",
  spotify: "#1DB954",
  direct:  "var(--brand-cyan)",
};

const SOURCE_LABELS: Record<string, string> = {
  youtube: "YT",
  spotify: "SP",
  direct:  "MP3",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function TrackQueue({
  queue,
  currentTrackId,
  isHost,
  isAdding = false,
  addError,
  onRemove,
  onVote,
  onAdd,
  onClearError,
  onSelect,
}: TrackQueueProps) {
  const [addUrl, setAddUrl] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const handleAdd = () => {
    const trimmed = addUrl.trim();
    if (!trimmed) return;
    onAdd?.(trimmed);
    setAddUrl("");
    // Keep the panel open so the user can see the loading state
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleAdd();
  };

  const handleToggleAdd = () => {
    setShowAdd((v) => !v);
    // Clear error when closing the panel
    if (showAdd) onClearError?.();
  };

  return (
    <div className="glass-card p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListMusic size={16} style={{ color: "var(--brand-cyan)" }} />
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              fontSize: "0.9rem",
              color: "var(--text-primary)",
            }}
          >
            Queue
          </span>
          {queue.length > 0 && (
            <span
              className="badge badge-cyan"
              style={{ fontSize: "0.7rem", padding: "2px 8px" }}
            >
              {queue.length}
            </span>
          )}
        </div>
        <button
          className="btn-icon"
          style={{ width: 32, height: 32 }}
          onClick={handleToggleAdd}
          aria-label={showAdd ? "Close add panel" : "Add track"}
        >
          <Plus
            size={16}
            style={{
              transition: "transform 0.2s ease",
              transform: showAdd ? "rotate(45deg)" : "none",
            }}
          />
        </button>
      </div>

      {/* Add track panel */}
      {showAdd && (
        <div className="flex flex-col gap-2 animate-fade-up">
          <div className="flex gap-2">
            <input
              className="input-base flex-1"
              placeholder="YouTube, Spotify, or direct audio URL…"
              value={addUrl}
              onChange={(e) => {
                setAddUrl(e.target.value);
                // Clear previous error as user types
                if (addError) onClearError?.();
              }}
              onKeyDown={handleKeyDown}
              disabled={isAdding}
              style={{ padding: "10px 14px", fontSize: "0.875rem" }}
              autoFocus
            />
            <button
              className="btn-primary"
              style={{
                padding: "10px 18px",
                borderRadius: "var(--radius-md)",
                minWidth: 72,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
              onClick={handleAdd}
              disabled={isAdding || !addUrl.trim()}
            >
              {isAdding ? (
                <Loader2 size={15} style={{ animation: "spin 0.8s linear infinite" }} />
              ) : (
                "Add"
              )}
            </button>
          </div>

          {/* Error message */}
          {addError && (
            <div
              className="flex items-start gap-2 p-3 rounded-xl animate-fade-up"
              style={{
                background: "rgba(248,113,113,0.08)",
                border: "1px solid rgba(248,113,113,0.25)",
              }}
            >
              <AlertCircle size={14} style={{ color: "#F87171", flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: "0.8rem", color: "#F87171", margin: 0, flex: 1 }}>
                {addError}
              </p>
              <button
                onClick={onClearError}
                style={{ color: "#F87171", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                aria-label="Dismiss error"
              >
                <X size={13} />
              </button>
            </div>
          )}

          {/* Source hint */}
          {!addError && (
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: 0, paddingLeft: 2 }}>
              Supports YouTube, Spotify tracks, and direct audio files (.mp3, .ogg, .wav…)
            </p>
          )}
        </div>
      )}

      {/* Track list */}
      <div className="flex flex-col gap-1" style={{ maxHeight: 340, overflowY: "auto" }}>
        {queue.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Music2 size={32} style={{ color: "var(--text-muted)" }} />
            <p className="text-sm text-center" style={{ color: "var(--text-muted)" }}>
              Queue is empty.{" "}
              {isHost
                ? "Click + to add a track."
                : "Ask the host to add a track."}
            </p>
          </div>
        )}

        {queue.map((track, i) => {
          const isCurrent = track.id === currentTrackId;
          const sourceLabel = track.source ? SOURCE_LABELS[track.source] : null;
          const sourceColor = track.source ? SOURCE_COLORS[track.source] : "var(--text-muted)";

          return (
            <div
              key={track.id}
              className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all group"
              style={{
                background: isCurrent ? "rgba(124,58,237,0.12)" : "transparent",
                border: isCurrent ? "1px solid rgba(124,58,237,0.25)" : "1px solid transparent",
              }}
              onClick={() => onSelect?.(track.id)}
            >
              {/* Drag handle (visual only, host only) */}
              {isHost && (
                <GripVertical
                  size={14}
                  style={{ color: "var(--text-muted)", opacity: 0, transition: "opacity 0.2s", flexShrink: 0 }}
                  className="group-hover:opacity-100"
                />
              )}

              {/* Index / playing indicator */}
              <div
                className="w-6 h-6 flex-shrink-0 flex items-center justify-center text-xs rounded-full"
                style={{
                  background: isCurrent ? "var(--brand-violet)" : "var(--bg-overlay)",
                  color: isCurrent ? "#fff" : "var(--text-muted)",
                  fontWeight: 600,
                }}
              >
                {isCurrent ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-live-dot" />
                ) : (
                  i + 1
                )}
              </div>

              {/* Thumbnail (if available) */}
              {track.thumbnailUrl || track.coverUrl ? (
                <img
                  src={track.thumbnailUrl ?? track.coverUrl}
                  alt={track.title}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 6,
                    objectFit: "cover",
                    flexShrink: 0,
                  }}
                />
              ) : null}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm font-medium truncate"
                  style={{ color: isCurrent ? "var(--brand-violet-light)" : "var(--text-primary)" }}
                >
                  {track.title}
                </p>
                <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                  {track.artist} · {formatTime(track.duration)}
                </p>
              </div>

              {/* Source badge */}
              {sourceLabel && (
                <span
                  style={{
                    fontSize: "0.65rem",
                    fontWeight: 700,
                    color: sourceColor,
                    background: `${sourceColor}22`,
                    border: `1px solid ${sourceColor}44`,
                    borderRadius: 4,
                    padding: "1px 5px",
                    flexShrink: 0,
                  }}
                >
                  {sourceLabel}
                </span>
              )}

              {/* Actions */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {!isHost && (
                  <button
                    className="btn-icon"
                    style={{ width: 28, height: 28 }}
                    onClick={(e) => { e.stopPropagation(); onVote?.(track.id); }}
                    aria-label="Vote for track"
                  >
                    <ThumbsUp size={13} />
                  </button>
                )}
                {isHost && (
                  <button
                    className="btn-icon"
                    style={{ width: 28, height: 28, color: "#F87171" }}
                    onClick={(e) => { e.stopPropagation(); onRemove?.(track.id); }}
                    aria-label="Remove track"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
