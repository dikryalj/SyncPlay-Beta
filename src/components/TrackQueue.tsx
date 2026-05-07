"use client";

import { useState } from "react";
import { ListMusic, Plus, ThumbsUp, Trash2, GripVertical, Music2 } from "lucide-react";
import { Track } from "./AudioPlayer";

interface TrackQueueProps {
  queue: Track[];
  currentTrackId?: string;
  isHost: boolean;
  onRemove?: (id: string) => void;
  onVote?: (id: string) => void;
  onAdd?: (url: string) => void;
  onSelect?: (id: string) => void;
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function TrackQueue({
  queue,
  currentTrackId,
  isHost,
  onRemove,
  onVote,
  onAdd,
  onSelect,
}: TrackQueueProps) {
  const [addUrl, setAddUrl] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const handleAdd = () => {
    if (!addUrl.trim()) return;
    onAdd?.(addUrl.trim());
    setAddUrl("");
    setShowAdd(false);
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
        </div>
        <button
          className="btn-icon"
          style={{ width: 32, height: 32 }}
          onClick={() => setShowAdd(!showAdd)}
          aria-label="Add track"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Add track input */}
      {showAdd && (
        <div className="flex gap-2 animate-fade-up">
          <input
            className="input-base flex-1"
            placeholder="Paste YouTube / MP3 URL..."
            value={addUrl}
            onChange={(e) => setAddUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            style={{ padding: "10px 14px", fontSize: "0.875rem" }}
          />
          <button className="btn-primary" style={{ padding: "10px 18px", borderRadius: "var(--radius-md)" }} onClick={handleAdd}>
            Add
          </button>
        </div>
      )}

      {/* Track list */}
      <div className="flex flex-col gap-1" style={{ maxHeight: 320, overflowY: "auto" }}>
        {queue.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Music2 size={32} style={{ color: "var(--text-muted)" }} />
            <p className="text-sm text-center" style={{ color: "var(--text-muted)" }}>
              Queue is empty. Add a track to get started.
            </p>
          </div>
        )}
        {queue.map((track, i) => {
          const isCurrent = track.id === currentTrackId;
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
              {/* Drag handle (visual only) */}
              {isHost && (
                <GripVertical
                  size={14}
                  style={{ color: "var(--text-muted)", opacity: 0, transition: "opacity 0.2s" }}
                  className="group-hover:opacity-100 flex-shrink-0"
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

              {/* Actions */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {!isHost && (
                  <button
                    className="btn-icon"
                    style={{ width: 28, height: 28 }}
                    onClick={(e) => { e.stopPropagation(); onVote?.(track.id); }}
                  >
                    <ThumbsUp size={13} />
                  </button>
                )}
                {isHost && (
                  <button
                    className="btn-icon"
                    style={{ width: 28, height: 28, color: "#F87171" }}
                    onClick={(e) => { e.stopPropagation(); onRemove?.(track.id); }}
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
