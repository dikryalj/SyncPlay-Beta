/**
 * AudioVisualizer.tsx — Reactive Audio Visualizer
 *
 * Two rendering modes:
 *  1. Web Audio API (direct sources): Connects to the <audio> element's
 *     MediaElementSourceNode → AnalyserNode, reads real frequency data
 *     each frame via getByteFrequencyData().
 *
 *  2. GSAP Simulated Waveform (YouTube / Spotify iframes): Since iframes
 *     block cross-origin audio access, GSAP drives an organic staggered
 *     bar animation that starts/stops with isPlaying.
 */

"use client";

import { useEffect, useRef, type RefObject } from "react";
import { gsap } from "gsap";

type TrackSource = "youtube" | "spotify" | "direct";

interface AudioVisualizerProps {
  isPlaying:  boolean;
  source?:    TrackSource;
  /** Pass the <audio> ref for real frequency analysis (direct sources only). */
  audioRef?:  RefObject<HTMLAudioElement | null>;
  barCount?:  number;
  height?:    number;
  className?: string;
}

export default function AudioVisualizer({
  isPlaying,
  source    = "direct",
  audioRef,
  barCount  = 40,
  height    = 52,
  className = "",
}: AudioVisualizerProps) {
  const isEmbed = source === "youtube" || source === "spotify";

  // ── Canvas mode (direct audio) ────────────────────────────────────────────
  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const animFrameRef   = useRef<number>(0);
  const barsRef        = useRef<number[]>(Array.from({ length: barCount }, () => 0.05));
  const audioCtxRef    = useRef<AudioContext | null>(null);
  const analyserRef    = useRef<AnalyserNode | null>(null);
  const dataArrayRef   = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const srcNodeRef     = useRef<MediaElementAudioSourceNode | null>(null);

  // Init Web Audio API lazily on first "play" event (requires user gesture)
  useEffect(() => {
    if (isEmbed || !audioRef?.current) return;
    const audio = audioRef.current;

    const init = () => {
      if (audioCtxRef.current) {
        // Resume if suspended (browser autoplay policy)
        if (audioCtxRef.current.state === "suspended") {
          audioCtxRef.current.resume().catch(() => {});
        }
        return;
      }
      try {
        const ctx      = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize               = 128;  // 64 frequency bins
        analyser.smoothingTimeConstant = 0.8;

        const srcNode = ctx.createMediaElementSource(audio);
        srcNode.connect(analyser);
        analyser.connect(ctx.destination);

        audioCtxRef.current  = ctx;
        analyserRef.current  = analyser;
        srcNodeRef.current   = srcNode;
        dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
      } catch (e) {
        console.warn("[AudioVisualizer] Web Audio API unavailable:", e);
      }
    };

    audio.addEventListener("play", init);
    return () => {
      audio.removeEventListener("play", init);
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
      analyserRef.current = null;
      srcNodeRef.current  = null;
    };
  }, [audioRef, isEmbed]);

  // Canvas draw loop
  useEffect(() => {
    if (isEmbed) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let phase = 0;

    const draw = () => {
      // Match canvas pixel size to display size
      const dpr = window.devicePixelRatio || 1;
      const W   = canvas.offsetWidth  * dpr;
      const H   = canvas.offsetHeight * dpr;
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width  = W;
        canvas.height = H;
      }
      ctx.clearRect(0, 0, W, H);

      const barW = (W / barCount) * 0.65;
      const gap  = (W / barCount) * 0.35;

      for (let i = 0; i < barCount; i++) {
        let targetNorm: number;

        if (isPlaying && analyserRef.current && dataArrayRef.current) {
          // Real frequency data
          analyserRef.current.getByteFrequencyData(dataArrayRef.current);
          const binIdx   = Math.floor((i / barCount) * dataArrayRef.current.length);
          const raw      = dataArrayRef.current[binIdx] / 255;
          targetNorm     = Math.pow(raw, 0.65); // perceptual boost
        } else if (isPlaying) {
          // Simulated fallback (no AudioContext yet)
          targetNorm = 0.1 + Math.abs(Math.sin(phase + i * 0.4 + Math.cos(i * 0.15))) * 0.9;
        } else {
          targetNorm = 0.04 + Math.abs(Math.sin(i * 0.5)) * 0.04;
        }

        // Exponential smoothing toward target
        barsRef.current[i] += (targetNorm - barsRef.current[i]) * (isPlaying ? 0.22 : 0.05);

        const barH = barsRef.current[i] * H;
        const x    = i * (barW + gap);
        const y    = H - barH;

        const grad = ctx.createLinearGradient(x, H, x, 0);
        grad.addColorStop(0,   "rgba(124,58,237,0.95)");
        grad.addColorStop(0.5, "rgba(99,102,241,0.85)");
        grad.addColorStop(1,   "rgba(6,182,212,0.90)");

        ctx.fillStyle   = grad;
        ctx.shadowColor = isPlaying ? "rgba(124,58,237,0.45)" : "transparent";
        ctx.shadowBlur  = isPlaying ? 7 : 0;
        ctx.beginPath();
        ctx.roundRect(x, y, Math.max(barW, 1), Math.max(barH, 2), [2, 2, 0, 0]);
        ctx.fill();
      }

      ctx.shadowBlur = 0;
      if (isPlaying) phase += 0.07;
      animFrameRef.current = requestAnimationFrame(draw);
    };

    animFrameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isPlaying, barCount, isEmbed]);

  // ── GSAP mode (embed sources) ─────────────────────────────────────────────
  const barRefsArr = useRef<(HTMLDivElement | null)[]>([]);
  const gsapCtxRef = useRef<gsap.Context | null>(null);

  useEffect(() => {
    if (!isEmbed) return;
    const bars = barRefsArr.current.filter(Boolean) as HTMLDivElement[];
    if (!bars.length) return;

    // Kill any existing GSAP animations
    gsapCtxRef.current?.kill();
    gsapCtxRef.current = null;

    if (isPlaying) {
      // Create a GSAP context for clean teardown
      const ctx = gsap.context(() => {
        bars.forEach((bar, i) => {
          const baseDelay = (i / bars.length) * 0.6;
          const dur       = 0.18 + Math.random() * 0.28;
          const peak      = 0.15 + Math.random() * 0.85;
          gsap.to(bar, {
            scaleY:   peak,
            duration: dur,
            repeat:   -1,
            yoyo:     true,
            ease:     "sine.inOut",
            delay:    baseDelay,
          });
        });
      });
      gsapCtxRef.current = ctx;
    } else {
      // Settle bars to idle height
      gsap.to(bars, { scaleY: 0.06, duration: 0.35, ease: "power2.out" });
    }

    return () => gsapCtxRef.current?.kill();
  }, [isPlaying, isEmbed]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isEmbed) {
    return (
      <div
        className={className}
        style={{
          width:       "100%",
          height:      `${height}px`,
          display:     "flex",
          alignItems:  "flex-end",
          gap:         "3px",
          overflow:    "hidden",
        }}
        aria-label="Audio visualizer"
      >
        {Array.from({ length: barCount }).map((_, i) => (
          <div
            key={i}
            ref={(el) => { barRefsArr.current[i] = el; }}
            style={{
              flex:             1,
              height:           "100%",
              transformOrigin:  "bottom",
              transform:        "scaleY(0.06)",
              background:       `linear-gradient(to top,
                rgba(124,58,237,${0.7 + (i / barCount) * 0.3}),
                rgba(6,182,212,${0.5 + (i / barCount) * 0.4}))`,
              borderRadius:     "2px 2px 0 0",
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: "100%", height: `${height}px`, display: "block" }}
      aria-label="Audio visualizer"
    />
  );
}
