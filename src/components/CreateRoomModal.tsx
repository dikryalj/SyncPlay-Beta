"use client";

import { useState } from "react";
import { X, Headphones, Link2, Loader2, Radio } from "lucide-react";
import { useRouter } from "next/navigation";

interface CreateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export default function CreateRoomModal({ isOpen, onClose }: CreateRoomModalProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleCreate = async () => {
    if (!name.trim()) { setError("Please enter your display name"); return; }
    setError("");
    setLoading(true);
    // Simulate room creation
    await new Promise((r) => setTimeout(r, 800));
    const code = generateCode();
    setLoading(false);
    router.push(`/room/${code}?host=true&name=${encodeURIComponent(name.trim())}&url=${encodeURIComponent(url.trim())}`);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
        onClick={onClose}
      >
        {/* Modal */}
        <div
          className="glass-elevated animate-scale-in w-full max-w-md rounded-2xl p-6 flex flex-col gap-5"
          style={{ border: "1px solid var(--border-accent)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.3)" }}
              >
                <Radio size={20} style={{ color: "var(--brand-violet-light)" }} />
              </div>
              <div>
                <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.125rem", margin: 0 }}>
                  Create a Room
                </h3>
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: 0 }}>
                  Start a new listening session
                </p>
              </div>
            </div>
            <button className="btn-icon" style={{ width: 36, height: 36 }} onClick={onClose}>
              <X size={18} />
            </button>
          </div>

          <div className="divider" />

          {/* Form */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                <Headphones size={14} className="inline mr-2" style={{ color: "var(--brand-violet-light)" }} />
                Your Display Name
              </label>
              <input
                className="input-base"
                placeholder="e.g. DJ Shadow"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                maxLength={24}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                <Link2 size={14} className="inline mr-2" style={{ color: "var(--brand-cyan)" }} />
                First Track URL{" "}
                <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                className="input-base"
                placeholder="YouTube, SoundCloud, or MP3 URL..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>

            {error && (
              <p className="text-sm animate-fade-up" style={{ color: "#F87171" }}>
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex gap-3 pt-1">
            <button className="btn-secondary flex-1" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-primary flex-1" onClick={handleCreate} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Creating…
                </>
              ) : (
                "Create Room"
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
