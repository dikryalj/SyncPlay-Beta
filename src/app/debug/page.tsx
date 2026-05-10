/**
 * debug/page.tsx — SyncPlay Debug Panel (Serverless Edition)
 * Shows Pusher connection health and Supabase room state.
 */
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, Wifi, WifiOff, ArrowLeft, RefreshCw, Radio, Zap, AlertTriangle, CheckCircle2 } from "lucide-react";
import { getPusherClient } from "@/lib/pusher-client";

interface PusherEvent { ts: number; name: string; payload: string; }

export default function DebugPage() {
  const router = useRouter();
  const [connected, setConnected]     = useState(false);
  const [socketId,  setSocketId]      = useState<string | null>(null);
  const [events,    setEvents]        = useState<PusherEvent[]>([]);
  const [latency,   setLatency]       = useState<number>(0);

  const addEvent = (name: string, payload: unknown) =>
    setEvents((p) => [{ ts: Date.now(), name, payload: JSON.stringify(payload, null, 2) }, ...p.slice(0, 49)]);

  useEffect(() => {
    const pusher = getPusherClient("debug-user", "Debug");

    pusher.connection.bind("connected", () => {
      setConnected(true);
      setSocketId(pusher.connection.socket_id);
      addEvent("pusher:connected", { socketId: pusher.connection.socket_id });
    });
    pusher.connection.bind("disconnected", () => { setConnected(false); addEvent("pusher:disconnected", {}); });
    pusher.connection.bind("error",        (e: unknown) => addEvent("pusher:error", e));

    // Simple latency estimate via ping
    const interval = setInterval(() => {
      const start = Date.now();
      fetch("/api/room/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomCode: "DEBUG_PING", userId: "debug", name: "Debug" }) })
        .then(() => setLatency(Date.now() - start))
        .catch(() => {});
    }, 5000);

    return () => {
      clearInterval(interval);
      pusher.connection.unbind_all();
    };
  }, []);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
      <div className="glow-orb glow-orb-violet" style={{ position: "fixed", width: 400, height: 400, top: -80, left: -80, opacity: 0.2, zIndex: 0 }} />
      <div className="relative z-10">
        <header className="glass sticky top-0 z-30" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <div className="container-app flex items-center justify-between h-16 gap-4">
            <button className="btn-icon" onClick={() => router.push("/")}><ArrowLeft size={18} /></button>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1.1rem" }}>
              Sync<span style={{ color: "var(--brand-violet-light)" }}>Play</span>
              <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: "0.8rem", marginLeft: 8 }}>Debug Panel</span>
            </span>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ background: connected ? "#4ADE80" : "#F87171", boxShadow: connected ? "0 0 8px #4ADE80" : "none" }} />
              <span className="text-sm hidden sm:inline" style={{ color: "var(--text-muted)" }}>
                {connected ? `Pusher · ${socketId?.slice(0, 10)}` : "Disconnected"}
              </span>
            </div>
          </div>
        </header>

        <main className="container-app py-8">
          <div className="grid gap-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>

            {/* Connection */}
            <div className="glass-card p-5 flex flex-col gap-4">
              <div className="flex items-center gap-2">
                {connected ? <Wifi size={16} style={{ color: "#4ADE80" }} /> : <WifiOff size={16} style={{ color: "#F87171" }} />}
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 600 }}>Pusher Connection</span>
              </div>
              {[
                { label: "Status",    value: connected ? "Connected" : "Disconnected", color: connected ? "#4ADE80" : "#F87171" },
                { label: "Socket ID", value: socketId ?? "—",                          color: "var(--text-primary)" },
                { label: "Transport", value: "WebSocket / Pusher Channels",             color: "var(--text-secondary)" },
                { label: "Cluster",   value: process.env.NEXT_PUBLIC_PUSHER_CLUSTER ?? "ap1", color: "var(--text-secondary)" },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center justify-between">
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{label}</span>
                  <span style={{ fontSize: "0.8rem", color, fontFamily: "var(--font-display)", fontWeight: 600 }}>{value}</span>
                </div>
              ))}
            </div>

            {/* Latency */}
            <div className="glass-card p-5 flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <Zap size={16} style={{ color: "var(--brand-cyan)" }} />
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 600 }}>API Latency (RTT)</span>
              </div>
              <div className="flex items-end gap-2">
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "2.5rem", color: latency < 300 ? "#4ADE80" : latency < 800 ? "#FBBF24" : "#F87171" }}>
                  {latency || "—"}
                </span>
                <span style={{ color: "var(--text-muted)", marginBottom: 8 }}>ms</span>
              </div>
              <p style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Measured via /api/room/join probe</p>
            </div>

            {/* Health */}
            <div className="glass-card p-5 flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <Activity size={16} style={{ color: "var(--brand-violet-light)" }} />
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 600 }}>Health Checks</span>
              </div>
              {[
                { label: "Pusher connected",        ok: connected },
                { label: "API reachable (<500ms)",  ok: latency > 0 && latency < 500 },
                { label: "Socket ID obtained",      ok: !!socketId },
              ].map(({ label, ok }) => (
                <div key={label} className="flex items-center gap-3">
                  {ok ? <CheckCircle2 size={14} style={{ color: "#4ADE80", flexShrink: 0 }} />
                      : <AlertTriangle size={14} style={{ color: "#FBBF24", flexShrink: 0 }} />}
                  <span style={{ fontSize: "0.825rem", color: ok ? "var(--text-primary)" : "var(--text-muted)" }}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Event Log */}
          <div className="glass-card p-5 flex flex-col gap-4 mt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radio size={16} style={{ color: "#EC4899" }} />
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 600 }}>Live Event Log</span>
                <span className="badge badge-violet" style={{ fontSize: "0.7rem" }}>{events.length}</span>
              </div>
              <button className="btn-icon" style={{ width: 32, height: 32 }} onClick={() => setEvents([])}><RefreshCw size={14} /></button>
            </div>
            <div style={{ maxHeight: 400, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
              {events.length === 0 && (
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center", padding: "24px 0" }}>
                  No events yet. Join a room to see live Pusher events.
                </p>
              )}
              {events.map((ev, i) => (
                <div key={i} style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(6,182,212,0.06)", border: "1px solid rgba(6,182,212,0.15)", fontFamily: "monospace", fontSize: "0.78rem" }}>
                  <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
                    <span style={{ color: "var(--brand-cyan)", fontWeight: 700 }}>← {ev.name}</span>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.72rem", marginLeft: "auto" }}>{new Date(ev.ts).toLocaleTimeString()}</span>
                  </div>
                  <pre style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.72rem", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                    {ev.payload.length > 200 ? ev.payload.slice(0, 200) + "…" : ev.payload}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
