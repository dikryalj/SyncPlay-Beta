"use client";

import { useEffect, useRef } from "react";

interface AudioVisualizerProps {
  isPlaying: boolean;
  barCount?: number;
  height?: number;
  className?: string;
}

export default function AudioVisualizer({
  isPlaying,
  barCount = 32,
  height = 64,
  className = "",
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const barsRef = useRef<number[]>(Array.from({ length: barCount }, () => Math.random()));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let phase = 0;

    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      const barW = (W / barCount) * 0.6;
      const gap = (W / barCount) * 0.4;

      for (let i = 0; i < barCount; i++) {
        // Smooth bar height toward a target
        const target = isPlaying
          ? 0.15 + Math.abs(Math.sin(phase + i * 0.35 + i * 0.1)) * 0.85
          : 0.05 + Math.abs(Math.sin(i * 0.5)) * 0.1;

        barsRef.current[i] += (target - barsRef.current[i]) * (isPlaying ? 0.12 : 0.06);

        const barH = barsRef.current[i] * H;
        const x = i * (barW + gap);
        const y = H - barH;

        // Gradient per bar
        const grad = ctx.createLinearGradient(x, H, x, 0);
        grad.addColorStop(0, "rgba(124,58,237,0.9)");
        grad.addColorStop(0.6, "rgba(124,58,237,0.7)");
        grad.addColorStop(1, "rgba(6,182,212,0.9)");

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, [2, 2, 0, 0]);
        ctx.fill();

        // Glow
        ctx.shadowColor = "rgba(124,58,237,0.4)";
        ctx.shadowBlur = 8;
      }

      ctx.shadowBlur = 0;
      if (isPlaying) phase += 0.05;
      animFrameRef.current = requestAnimationFrame(draw);
    };

    animFrameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isPlaying, barCount]);

  // Resize canvas to match display size
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resize();
    const obs = new ResizeObserver(resize);
    obs.observe(canvas);
    return () => obs.disconnect();
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: "100%", height: `${height}px`, display: "block" }}
      aria-label="Audio visualizer"
    />
  );
}
