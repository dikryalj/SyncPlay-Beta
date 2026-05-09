/**
 * debug/page.tsx
 * SyncPlay Debug Panel — real-time diagnostics for socket connection,
 * latency stats, and room state inspection.
 */

"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Activity, Wifi, WifiOff, ArrowLeft, RefreshCw,
  Clock, Radio, Zap, AlertTriangle, CheckCircle2
} from "lucide-react";
import { getSocket, EVENTS } from "@/lib/socket";

interface SocketEvent {
  ts: number;
  dir: "in" | "out";
  name: string;
  payload: string;
}

interface LatencyReading {
  ts: number;
  rtt: number;
}

export default function DebugPage() {
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const [socketId, setSocketId] = useState<string | null>(null);
  const [events, setEvents] = useState<SocketEvent[]>([]);
  const [latencyHistory, setLatencyHistory] = useState<LatencyReading[]>([]);
  const [smoothedRtt, setSmoothedRtt] = useState(0);
  const [pingCount, setPingCount] = useState(0);
  const logRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const addEvent = (dir: "in" | "out", name: string, payload: unknown) => {
    setEvents((prev) => [
      { ts: Date.now(), dir, name, payload: JSON.stringify(payload, null, 2) },
      ...prev.slice(0, 49), // keep last 50 events
    ]);
  };

  useEffect(() => {
    let socket: ReturnType<typeof getSocket>;
    try {
      socket = getSocket();
    } catch {
      return;
    }

    const onConnect = () => {
      setConnected(true);
      setSocketId(socket.id ?? null);
      addEvent("in", "connect", { socketId: socket.id });
    };
    const onDisconnect = (reason: string) => {
      setConnected(false);
      addEvent("in", "disconnect", { reason });
    };
    const onPong = ({ ts, serverTs }: { ts: number; serverTs: number }) => {
      const rtt = Date.now() - ts;
      setLatencyHistory((h) => [...h.slice(-29), { ts: Date.now(), rtt }]);
      // Update smoothed RTT (simple EMA α=0.3)
      setSmoothedRtt((prev) => prev === 0 ? rtt : Math.round(prev * 0.7 + rtt * 0.3));
      addEvent("in", EVENTS.PONG, { rtt, serverTs });
    };
    const onRoomState = (s: unknown) => addEvent("in", EVENTS.ROOM_STATE, s);
    const onQueueUpdate = (s: unknown) => addEvent("in", EVENTS.QUEUE_UPDATE, s);
    const onSyncPlay = (s: unknown) => addEvent("in", EVENTS.SYNC_PLAY, s);
    const onSyncPause = (s: unknown) => addEvent("in", EVENTS.SYNC_PAUSE, s);
    const onSyncSeek = (s: unknown) => addEvent("in", EVENTS.SYNC_SEEK, s);
    const onSyncTrack = (s: unknown) => addEvent("in", EVENTS.SYNC_TRACK, s);
    const onHostChanged = (s: unknown) => addEvent("in", EVENTS.HOST_CHANGED, s);
    const onError = (s: unknown) => addEvent("in", EVENTS.ERROR, s);

    if (socket.connected) {
      setConnected(true);
      setSocketId(socket.id ?? null);
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on(EVENTS.PONG, onPong);
    socket.on(EVENTS.ROOM_STATE, onRoomState);
    socket.on(EVENTS.QUEUE_UPDATE, onQueueUpdate);
    socket.on(EVENTS.SYNC_PLAY, onSyncPlay);
    socket.on(EVENTS.SYNC_PAUSE, onSyncPause);
    socket.on(EVENTS.SYNC_SEEK, onSyncSeek);
    socket.on(EVENTS.SYNC_TRACK, onSyncTrack);
    socket.on(EVENTS.HOST_CHANGED, onHostChanged);
    socket.on(EVENTS.ERROR, onError);

    // Send pings every 2s
    intervalRef.current = setInterval(() => {
      if (socket.connected) {
        const ts = Date.now();
        socket.emit(EVENTS.PING, { ts });
        setPingCount((c) => c + 1);
        addEvent("out", EVENTS.PING, { ts });
      }
    }, 2000);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off(EVENTS.PONG, onPong);
      socket.off(EVENTS.ROOM_STATE, onRoomState);
      socket.off(EVENTS.QUEUE_UPDATE, onQueueUpdate);
      socket.off(EVENTS.SYNC_PLAY, onSyncPlay);
      socket.off(EVENTS.SYNC_PAUSE, onSyncPause);
      socket.off(EVENTS.SYNC_SEEK, onSyncSeek);
      socket.off(EVENTS.SYNC_TRACK, onSyncTrack);
      socket.off(EVENTS.HOST_CHANGED, onHostChanged);
      socket.off(EVENTS.ERROR, onError);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const maxRtt = Math.max(...latencyHistory.map((r) => r.rtt), 1);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
      <div className="glow-orb glow-orb-violet" style={{ position: "fixed", width: 400, height: 400, top: -80, left: -80, opacity: 0.2, zIndex: 0 }} />

      <div className="relative z-10">
        {/* Header */}
        <header className="glass sticky top-0 z-30" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <div className="container-app flex items-center justify-between h-16 gap-4">
            <button className="btn-icon" onClick={() => router.push("/")} aria-label="Back to home">
              <ArrowLeft size={18} />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg,#7C3AED,#4F46E5)" }}>
                <Activity size={16} color="#fff" />
              </div>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1.1rem", color: "var(--text-primary)" }}>
                Sync<span style={{ color: "var(--brand-violet-light)" }}>Play</span>
                <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: "0.8rem", marginLeft: 8 }}>Debug Panel</span>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ background: connected ? "#4ADE80" : "#F87171", boxShadow: connected ? "0 0 8px #4ADE80" : "none", transition: "all 0.3s" }} />
              <span className="text-sm hidden sm:inline" style={{ color: "var(--text-muted)" }}>
                {connected ? `Connected · ${socketId?.slice(0, 8)}…` : "Disconnected"}
              </span>
            </div>
          </div>
        </header>

        <main className="container-app py-8">
          <div className="grid gap-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>

            {/* Connection Status Card */}
            <div className="glass-card p-5 flex flex-col gap-4">
              <div className="flex items-center gap-2">
                {connected ? <Wifi size={16} style={{ color: "#4ADE80" }} /> : <WifiOff size={16} style={{ color: "#F87171" }} />}
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "0.9rem" }}>Connection</span>
              </div>
              <div className="flex flex-col gap-2">
                {[
                  { label: "Status", value: connected ? "Connected" : "Disconnected", color: connected ? "#4ADE80" : "#F87171" },
                  { label: "Socket ID", value: socketId ?? "—", color: "var(--text-primary)" },
                  { label: "Transport", value: "WebSocket / polling", color: "var(--text-secondary)" },
                  { label: "Path", value: "/api/socketio", color: "var(--text-secondary)" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{label}</span>
                    <span style={{ fontSize: "0.8rem", color, fontFamily: "var(--font-display)", fontWeight: 600 }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Latency Card */}
            <div className="glass-card p-5 flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <Zap size={16} style={{ color: "var(--brand-cyan)" }} />
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "0.9rem" }}>Latency (RTT)</span>
              </div>

              <div className="flex items-end gap-2">
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "2.5rem", color: smoothedRtt < 80 ? "#4ADE80" : smoothedRtt < 200 ? "#FBBF24" : "#F87171" }}>
                  {smoothedRtt}
                </span>
                <span style={{ color: "var(--text-muted)", marginBottom: 8 }}>ms</span>
              </div>

              {/* Mini RTT sparkline */}
              <div className="flex items-end gap-0.5" style={{ height: 40 }}>
                {latencyHistory.map((r, i) => (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: `${(r.rtt / maxRtt) * 100}%`,
                      borderRadius: "2px 2px 0 0",
                      background: r.rtt < 80 ? "#4ADE80" : r.rtt < 200 ? "#FBBF24" : "#F87171",
                      opacity: 0.7 + (i / latencyHistory.length) * 0.3,
                    }}
                  />
                ))}
                {latencyHistory.length === 0 && (
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Waiting for pongs…</span>
                )}
              </div>

              <div className="flex justify-between" style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                <span>Pings sent: {pingCount}</span>
                <span>Samples: {latencyHistory.length}</span>
              </div>
            </div>

            {/* Health indicators */}
            <div className="glass-card p-5 flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <Clock size={16} style={{ color: "var(--brand-violet-light)" }} />
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "0.9rem" }}>Health Checks</span>
              </div>
              <div className="flex flex-col gap-3">
                {[
                  { label: "Socket connected", ok: connected },
                  { label: "RTT < 100ms", ok: smoothedRtt > 0 && smoothedRtt < 100 },
                  { label: "RTT measured", ok: smoothedRtt > 0 },
                  { label: "Server responding", ok: latencyHistory.length > 0 },
                ].map(({ label, ok }) => (
                  <div key={label} className="flex items-center gap-3">
                    {ok
                      ? <CheckCircle2 size={14} style={{ color: "#4ADE80", flexShrink: 0 }} />
                      : <AlertTriangle size={14} style={{ color: "#FBBF24", flexShrink: 0 }} />
                    }
                    <span style={{ fontSize: "0.825rem", color: ok ? "var(--text-primary)" : "var(--text-muted)" }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Event Log */}
          <div className="glass-card p-5 flex flex-col gap-4 mt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radio size={16} style={{ color: "#EC4899" }} />
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "0.9rem" }}>Live Event Log</span>
                <span className="badge badge-violet" style={{ fontSize: "0.7rem" }}>{events.length}</span>
              </div>
              <button className="btn-icon" style={{ width: 32, height: 32 }} onClick={() => setEvents([])} aria-label="Clear log">
                <RefreshCw size={14} />
              </button>
            </div>

            <div
              ref={logRef}
              style={{ maxHeight: 400, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}
            >
              {events.length === 0 && (
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center", padding: "24px 0" }}>
                  No events yet. Join a room to see live socket events.
                </p>
              )}
              {events.map((ev, i) => (
                <div
                  key={i}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: ev.dir === "in" ? "rgba(6,182,212,0.06)" : "rgba(124,58,237,0.06)",
                    border: `1px solid ${ev.dir === "in" ? "rgba(6,182,212,0.15)" : "rgba(124,58,237,0.15)"}`,
                    fontFamily: "monospace",
                    fontSize: "0.78rem",
                  }}
                >
                  <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
                    <span style={{ color: ev.dir === "in" ? "var(--brand-cyan)" : "var(--brand-violet-light)", fontWeight: 700 }}>
                      {ev.dir === "in" ? "←" : "→"} {ev.name}
                    </span>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.72rem", marginLeft: "auto" }}>
                      {new Date(ev.ts).toLocaleTimeString()}
                    </span>
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
