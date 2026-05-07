"use client";

import { useState } from "react";
import { Copy, Check, Share2 } from "lucide-react";

interface RoomCodeInputProps {
  code: string;
}

export default function RoomCodeInput({ code }: RoomCodeInputProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const shareUrl = typeof window !== "undefined"
    ? `${window.location.origin}/room/${code}`
    : `/room/${code}`;

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: "Join my SyncPlay room",
        text: `Join my SyncPlay room with code: ${code}`,
        url: shareUrl,
      });
    } else {
      navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="glass-card p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: "0.9rem",
            color: "var(--text-primary)",
          }}
        >
          Room Code
        </span>
        <span className="badge badge-green">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-live-dot" />
          Live
        </span>
      </div>

      {/* Code display */}
      <div
        className="flex items-center justify-between p-4 rounded-xl"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-accent)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: "1.75rem",
            letterSpacing: "0.2em",
            color: "var(--brand-violet-light)",
          }}
        >
          {code}
        </span>
        <div className="flex gap-2">
          <button
            className="btn-icon tooltip"
            data-tip={copied ? "Copied!" : "Copy code"}
            onClick={handleCopy}
            style={{ color: copied ? "#4ADE80" : undefined }}
          >
            {copied ? <Check size={18} /> : <Copy size={18} />}
          </button>
          <button
            className="btn-icon tooltip"
            data-tip="Share room"
            onClick={handleShare}
          >
            <Share2 size={18} />
          </button>
        </div>
      </div>

      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        Share this code with friends to listen together in real-time.
      </p>
    </div>
  );
}
