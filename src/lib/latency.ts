/**
 * latency.ts
 * RTT-based latency compensation hook for SyncPlay.
 *
 * Algorithm:
 *  1. Every PING_INTERVAL ms, emit a "ping" with a client timestamp.
 *  2. Server reflects it back as "pong" with the same ts + serverTs.
 *  3. RTT = Date.now() - ping.ts
 *  4. Jitter smoothing: keep a rolling window of WINDOW_SIZE readings,
 *     discard any > 2× median, average the rest.
 *  5. compensate(rawTime) adds RTT/2 to rawTime so the follower seeks
 *     to where the master *will be* by the time the packet arrives.
 */

"use client";

import { useEffect, useRef, useCallback, type MutableRefObject } from "react";
import { getSocket, EVENTS } from "./socket";

const PING_INTERVAL = 5_000; // ms
const WINDOW_SIZE = 5;       // number of RTT samples to keep

export interface LatencyStats {
  rtt: number;       // current smoothed RTT in ms
  offset: number;    // estimated server↔client clock offset in ms (positive = server ahead)
}

/**
 * useLatencyCompensation
 *
 * Starts pinging the server and measuring RTT.
 * Returns a stable `compensate` function that adjusts a raw sync time
 * by half the current smoothed RTT.
 *
 * @param enabled - pass false to disable (e.g. when socket is disconnected)
 */
export function useLatencyCompensation(enabled = true): {
  compensate: (rawTime: number) => number;
  stats: MutableRefObject<LatencyStats>;
} {
  const samples = useRef<number[]>([]);
  const stats = useRef<LatencyStats>({ rtt: 0, offset: 0 });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Ping / Pong ────────────────────────────────────────────────────────────

  const startPinging = useCallback(() => {
    if (intervalRef.current) return;
    intervalRef.current = setInterval(() => {
      try {
        getSocket().emit(EVENTS.PING, { ts: Date.now() });
      } catch { /* socket not ready */ }
    }, PING_INTERVAL);
    // Kick off immediately
    try {
      getSocket().emit(EVENTS.PING, { ts: Date.now() });
    } catch { /* ignore */ }
  }, []);

  const stopPinging = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // ── RTT smoothing ──────────────────────────────────────────────────────────

  const handlePong = useCallback(({ ts, serverTs }: { ts: number; serverTs: number }) => {
    const now = Date.now();
    const rtt = now - ts;
    const offset = serverTs - now + rtt / 2; // clock offset estimate

    // Add to rolling window
    samples.current = [...samples.current.slice(-(WINDOW_SIZE - 1)), rtt];

    // Jitter smoothing: discard samples > 2× median
    const sorted = [...samples.current].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const filtered = sorted.filter((s) => s <= median * 2);
    const smoothedRtt = filtered.reduce((a, b) => a + b, 0) / (filtered.length || 1);

    stats.current = { rtt: smoothedRtt, offset };
  }, []);

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!enabled) return;
    const socket = getSocket();
    socket.on(EVENTS.PONG, handlePong);
    startPinging();
    return () => {
      socket.off(EVENTS.PONG, handlePong);
      stopPinging();
    };
  }, [enabled, handlePong, startPinging, stopPinging]);

  // ── compensate ─────────────────────────────────────────────────────────────

  /**
   * Adjusts a raw server-sent playback time by half the smoothed RTT,
   * so the follower's seek target accounts for network transit time.
   *
   * Example: server sends time=30.00s, RTT=80ms
   * → compensate returns 30.04s (master will be at ~30.04s by arrival)
   */
  const compensate = useCallback((rawTime: number): number => {
    const halfRttSeconds = stats.current.rtt / 2 / 1000;
    return rawTime + halfRttSeconds;
  }, []);

  return { compensate, stats };
}
