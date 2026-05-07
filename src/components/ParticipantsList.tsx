"use client";

import { Users, Crown, Wifi, WifiOff } from "lucide-react";

export interface Participant {
  id: string;
  name: string;
  isHost: boolean;
  isOnline: boolean;
  avatar?: string;
}

interface ParticipantsListProps {
  participants: Participant[];
  currentUserId?: string;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getAvatarColor(id: string) {
  const colors = [
    "linear-gradient(135deg,#7C3AED,#4F46E5)",
    "linear-gradient(135deg,#06B6D4,#0284C7)",
    "linear-gradient(135deg,#EC4899,#7C3AED)",
    "linear-gradient(135deg,#10B981,#06B6D4)",
    "linear-gradient(135deg,#F59E0B,#EF4444)",
    "linear-gradient(135deg,#8B5CF6,#EC4899)",
  ];
  const idx = id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % colors.length;
  return colors[idx];
}

export default function ParticipantsList({ participants, currentUserId }: ParticipantsListProps) {
  return (
    <div className="glass-card p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users size={16} style={{ color: "var(--brand-violet-light)" }} />
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              fontSize: "0.9rem",
              color: "var(--text-primary)",
            }}
          >
            Listeners
          </span>
        </div>
        <span className="badge badge-violet">{participants.length}</span>
      </div>

      {/* List */}
      <div className="flex flex-col gap-2">
        {participants.length === 0 && (
          <p className="text-sm text-center py-4" style={{ color: "var(--text-muted)" }}>
            No participants yet
          </p>
        )}
        {participants.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-3 p-3 rounded-xl transition-all"
            style={{
              background: p.id === currentUserId ? "rgba(124,58,237,0.08)" : "transparent",
              border: p.id === currentUserId ? "1px solid rgba(124,58,237,0.2)" : "1px solid transparent",
            }}
          >
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white"
                style={{ background: getAvatarColor(p.id) }}
              >
                {getInitials(p.name)}
              </div>
              {/* Online indicator */}
              <span
                className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2"
                style={{
                  background: p.isOnline ? "#4ADE80" : "var(--text-muted)",
                  borderColor: "var(--bg-surface)",
                }}
              />
            </div>

            {/* Name */}
            <div className="flex-1 min-w-0">
              <p
                className="text-sm font-medium truncate"
                style={{ color: p.id === currentUserId ? "var(--brand-violet-light)" : "var(--text-primary)" }}
              >
                {p.name}
                {p.id === currentUserId && (
                  <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> (you)</span>
                )}
              </p>
            </div>

            {/* Role indicators */}
            <div className="flex items-center gap-1.5">
              {p.isHost && (
                <span className="tooltip" data-tip="Host">
                  <Crown size={14} style={{ color: "#F59E0B" }} />
                </span>
              )}
              {p.isOnline ? (
                <Wifi size={13} style={{ color: "#4ADE80" }} />
              ) : (
                <WifiOff size={13} style={{ color: "var(--text-muted)" }} />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer ping */}
      <div
        className="flex items-center gap-2 pt-1"
        style={{ borderTop: "1px solid var(--border-subtle)" }}
      >
        <span
          className="w-2 h-2 rounded-full animate-live-dot"
          style={{ background: "#4ADE80" }}
        />
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          Sync margin &lt;50ms
        </span>
      </div>
    </div>
  );
}
