"use client";

import { useState, useEffect, useRef } from "react";
import {
  Music2, Zap, Globe, Users, Radio, ChevronRight,
  Headphones, Wifi, ArrowRight
} from "lucide-react";
import Navbar from "@/components/Navbar";
import CreateRoomModal from "@/components/CreateRoomModal";
import { useRouter } from "next/navigation";

const FEATURES = [
  {
    icon: Globe, color: "var(--brand-violet)", glow: "rgba(124,58,237,0.2)",
    title: "Global Share Play",
    desc: "Generate a secure room code and invite anyone worldwide. No downloads, no accounts — just share and listen.",
  },
  {
    icon: Zap, color: "var(--brand-cyan)", glow: "rgba(6,182,212,0.2)",
    title: "< 50ms Sync Margin",
    desc: "NTP-style clock synchronization keeps every device perfectly aligned, even on unstable connections.",
  },
  {
    icon: Radio, color: "#EC4899", glow: "rgba(236,72,153,0.2)",
    title: "Live Visualizer",
    desc: "Real-time waveform analysis that pulses in sync with the beat across every connected device.",
  },
  {
    icon: Users, color: "#10B981", glow: "rgba(16,185,129,0.2)",
    title: "Collaborative Queue",
    desc: "Every participant can suggest tracks. Vote on the next song — the crowd decides what plays next.",
  },
];

const STEPS = [
  { step: "01", title: "Create a Room", desc: "Paste a track URL and get your unique 6-character code instantly." },
  { step: "02", title: "Share the Code", desc: "Send the code to friends anywhere. They join at syncplay.io/room/[CODE]." },
  { step: "03", title: "Listen in Sync", desc: "Everyone hears the same track at the same moment through their own device." },
];

const DEMO_COUNT = 28;

export default function LandingPage() {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinName, setJoinName] = useState("");
  const [joinError, setJoinError] = useState("");
  const [bars, setBars] = useState<number[]>(Array(DEMO_COUNT).fill(0.2));
  const phase = useRef(0);
  const raf = useRef<number>(0);

  useEffect(() => {
    const tick = () => {
      phase.current += 0.04;
      setBars(Array.from({ length: DEMO_COUNT }, (_, i) =>
        0.15 + Math.abs(Math.sin(phase.current + i * 0.38)) * 0.85
      ));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, []);

  const handleJoin = () => {
    if (!joinName.trim()) { setJoinError("Enter your display name"); return; }
    if (!joinCode.trim()) { setJoinError("Enter a room code"); return; }
    router.push(`/room/${joinCode.trim().toUpperCase()}?name=${encodeURIComponent(joinName.trim())}`);
  };

  return (
    <div className="min-h-screen grid-bg" style={{ background: "var(--bg-base)" }}>
      <Navbar />

      {/* HERO */}
      <section className="relative flex flex-col items-center justify-center text-center overflow-hidden" style={{ minHeight: "100vh", paddingTop: 80 }}>
        <div className="glow-orb glow-orb-violet" style={{ width: 600, height: 600, top: "5%", left: "50%", transform: "translateX(-50%)", opacity: 0.55 }} />
        <div className="glow-orb glow-orb-cyan" style={{ width: 280, height: 280, bottom: "12%", right: "8%", opacity: 0.35 }} />

        <div className="container-app relative z-10 flex flex-col items-center gap-8">
          <div className="badge badge-violet animate-fade-up" style={{ fontSize: "0.8rem" }}>
            <span className="w-1.5 h-1.5 rounded-full animate-live-dot" style={{ background: "var(--brand-violet-light)" }} />
            Real-Time Audio Sync · Phase 1 Live
          </div>

          <h1 className="animate-fade-up delay-100" style={{ maxWidth: 800 }}>
            Listen Together,{" "}
            <span className="text-gradient">In Perfect Sync</span>
          </h1>

          <p className="animate-fade-up delay-200" style={{ maxWidth: 520, fontSize: "1.125rem", color: "var(--text-secondary)" }}>
            Share music from any URL across unlimited devices simultaneously.
            Create a room, share the code — and everyone hears it together.
          </p>

          <div className="flex flex-wrap gap-4 justify-center animate-fade-up delay-300">
            <button id="btn-create-room" className="btn-primary" style={{ padding: "15px 32px", fontSize: "1rem" }} onClick={() => setModalOpen(true)}>
              <Radio size={20} /> Create a Room
            </button>
            <a href="#join" style={{ textDecoration: "none" }}>
              <button className="btn-secondary" style={{ padding: "15px 32px", fontSize: "1rem" }}>
                <Headphones size={20} /> Join a Room
              </button>
            </a>
          </div>

          {/* Demo visualizer bars */}
          <div className="animate-fade-up delay-400 w-full flex items-end justify-center gap-1" style={{ maxWidth: 480, height: 72, marginTop: 8 }}>
            {bars.map((h, i) => (
              <div key={i} className="flex-1 vis-bar" style={{ height: `${h * 100}%`, transition: "height 0.08s ease" }} />
            ))}
          </div>

          {/* Stats */}
          <div className="animate-fade-up delay-500 flex flex-wrap gap-8 justify-center">
            {[{ val: "<50ms", label: "Sync Latency" }, { val: "∞", label: "Devices / Room" }, { val: "Any URL", label: "Source Support" }].map(({ val, label }) => (
              <div key={label} className="flex flex-col items-center gap-1">
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1.5rem", color: "var(--brand-violet-light)" }}>{val}</span>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="absolute bottom-10 left-1/2 animate-float" style={{ transform: "translateX(-50%)", color: "var(--text-muted)" }}>
          <ChevronRight size={20} style={{ transform: "rotate(90deg)" }} />
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" style={{ padding: "100px 0" }}>
        <div className="container-app flex flex-col gap-14">
          <div className="flex flex-col items-center gap-4 text-center">
            <span className="badge badge-violet">Platform Features</span>
            <h2>Everything You Need to <span className="text-gradient">Listen Together</span></h2>
          </div>
          <div className="grid gap-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            {FEATURES.map(({ icon: Icon, color, glow, title, desc }) => (
              <div key={title} className="glass-card p-6 flex flex-col gap-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: glow, border: `1px solid ${color}44` }}>
                  <Icon size={22} style={{ color }} />
                </div>
                <div className="flex flex-col gap-2">
                  <h4 style={{ fontFamily: "var(--font-display)", margin: 0 }}>{title}</h4>
                  <p style={{ fontSize: "0.9rem", margin: 0, color: "var(--text-secondary)" }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" style={{ padding: "80px 0 100px" }}>
        <div className="container-app flex flex-col gap-14">
          <div className="flex flex-col items-center gap-4 text-center">
            <span className="badge badge-cyan">Simple as 1-2-3</span>
            <h2>How <span className="text-gradient">SyncPlay</span> Works</h2>
          </div>
          <div className="grid gap-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            {STEPS.map(({ step, title, desc }) => (
              <div key={step} className="flex flex-col gap-4">
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "3rem", lineHeight: 1, background: "linear-gradient(135deg, var(--brand-violet), var(--brand-cyan))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{step}</span>
                <div className="p-6 rounded-2xl flex flex-col gap-2" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
                  <h4 style={{ margin: 0, fontFamily: "var(--font-display)" }}>{title}</h4>
                  <p style={{ fontSize: "0.9rem", margin: 0, color: "var(--text-secondary)" }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* JOIN ROOM */}
      <section id="join" style={{ padding: "80px 0 120px" }}>
        <div className="container-app flex justify-center">
          <div className="w-full max-w-lg glass-card p-8 flex flex-col gap-6" style={{ border: "1px solid var(--border-accent)" }}>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Headphones size={20} style={{ color: "var(--brand-violet-light)" }} />
                <h3 style={{ fontFamily: "var(--font-display)", margin: 0, fontSize: "1.375rem" }}>Join a Room</h3>
              </div>
              <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--text-secondary)" }}>Have a room code? Enter it below to join instantly.</p>
            </div>
            <div className="divider" />
            <div className="flex flex-col gap-4">
              <input id="input-your-name" className="input-base" placeholder="Your display name" value={joinName} onChange={(e) => setJoinName(e.target.value)} />
              <input id="input-room-code" className="input-base" placeholder="Room code (e.g. AB12CD)" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} maxLength={6} style={{ letterSpacing: "0.15em", fontWeight: 600, textTransform: "uppercase" }} onKeyDown={(e) => e.key === "Enter" && handleJoin()} />
              {joinError && <p className="text-sm animate-fade-up" style={{ color: "#F87171" }}>{joinError}</p>}
            </div>
            <button id="btn-join-room" className="btn-primary" style={{ padding: 15, justifyContent: "center" }} onClick={handleJoin}>
              <Wifi size={18} /> Join & Listen
            </button>
            <p className="text-center text-sm" style={{ color: "var(--text-muted)" }}>
              No code?{" "}
              <button onClick={() => setModalOpen(true)} style={{ color: "var(--brand-violet-light)", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
                Create your own room →
              </button>
            </p>
          </div>
        </div>
      </section>

      {/* ROADMAP */}
      <section id="roadmap" style={{ padding: "60px 0 100px" }}>
        <div className="container-app flex flex-col gap-10">
          <div className="flex flex-col items-center gap-4 text-center">
            <span className="badge badge-violet">What&apos;s Coming</span>
            <h2>Roadmap</h2>
          </div>
          <div className="flex flex-col gap-4 max-w-2xl mx-auto w-full">
            {[
              { phase: "Phase 1", label: "MVP", status: "live", items: ["WebSocket room sync", "Playback state broadcasting", "Latency compensation"] },
              { phase: "Phase 2", label: "Pro UI/UX", status: "soon", items: ["Industrial Dark theme polish", "Advanced Audio API visualizers", "Mobile PWA"] },
              { phase: "Phase 3", label: "Enterprise", status: "planned", items: ["AI audio enhancement", "Global edge servers", "Ultra-low latency streaming"] },
            ].map(({ phase, label, status, items }) => (
              <div key={phase} className="p-5 rounded-2xl flex items-start gap-5" style={{ background: "var(--bg-surface)", border: `1px solid ${status === "live" ? "rgba(74,222,128,0.25)" : "var(--border-subtle)"}` }}>
                <div className="flex flex-col items-center gap-1" style={{ minWidth: 72 }}>
                  <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "0.8rem", color: "var(--text-muted)" }}>{phase}</span>
                  <span className={`badge ${status === "live" ? "badge-green" : status === "soon" ? "badge-violet" : "badge-cyan"}`} style={{ fontSize: "0.7rem" }}>{status}</span>
                </div>
                <div className="flex flex-col gap-2">
                  <h4 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "1rem" }}>{label}</h4>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                    {items.map((item) => (
                      <li key={item} className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                        <ArrowRight size={12} style={{ color: "var(--brand-violet-light)", flexShrink: 0 }} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: "1px solid var(--border-subtle)", padding: "40px 0" }}>
        <div className="container-app flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Music2 size={18} style={{ color: "var(--brand-violet-light)" }} />
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, color: "var(--text-primary)" }}>SyncPlay</span>
            <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>— Real-Time Audio Platform</span>
          </div>
          <div className="flex items-center gap-4">
            <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>© 2026 SyncPlay Engineering</span>
          </div>
        </div>
      </footer>

      <CreateRoomModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
