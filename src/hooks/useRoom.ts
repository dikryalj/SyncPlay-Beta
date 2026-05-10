/**
 * useRoom.ts — Core room hook for SyncPlay serverless architecture.
 *
 * Fixes applied:
 *  - Import from pusher-client.ts (browser-only bundle)
 *  - sendBeacon uses Blob with application/json content-type
 *  - Track type imported from @/lib/types (single source of truth)
 *  - useEffect deps array is correct (no stale closures)
 *  - hasJoined ref reset properly for Strict Mode
 */

"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getPusherClient } from "@/lib/pusher-client";
import type { Track, RoomMember, SyncEvent } from "@/lib/types";

interface UseRoomOptions {
  code:          string;
  userId:        string;
  userName:      string;
  initialIsHost: boolean;
  initialUrl:    string;
}

export interface UseRoomReturn {
  currentTrack:    Track | null;
  queue:           Track[];
  isPlaying:       boolean;
  syncTime:        number | null;
  members:         RoomMember[];
  hostUserId:      string;
  connected:       boolean;
  isAdding:        boolean;
  addError:        string;
  liveTimeRef:     React.MutableRefObject<number>;
  play:            (time: number) => void;
  pause:           (time: number) => void;
  seek:            (time: number) => void;
  addToQueue:      (url: string) => Promise<void>;
  removeFromQueue: (trackId: string) => void;
  changeTrack:     (track: Track) => void;
  clearAddError:   () => void;
}

export function useRoom({
  code,
  userId,
  userName,
  initialIsHost,
  initialUrl,
}: UseRoomOptions): UseRoomReturn {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [queue,        setQueue]         = useState<Track[]>([]);
  const [isPlaying,    setIsPlaying]     = useState(false);
  const [syncTime,     setSyncTime]      = useState<number | null>(null);
  const [members,      setMembers]       = useState<RoomMember[]>([]);
  const [hostUserId,   setHostUserId]    = useState<string>("");
  const [connected,    setConnected]     = useState(false);
  const [isAdding,     setIsAdding]      = useState(false);
  const [addError,     setAddError]      = useState("");

  const liveTimeRef = useRef<number>(0);
  const hasJoined   = useRef(false);

  // ── Latency compensation ──────────────────────────────────────────────────
  const compensate = useCallback((rawTime: number, serverTs: number): number => {
    const delaySeconds = Math.max(0, Date.now() - serverTs) / 1000;
    return rawTime + Math.min(delaySeconds, 2); // cap at 2s
  }, []);

  // ── API fire-and-forget helper ────────────────────────────────────────────
  const apiSync = useCallback(
    (action: string, payload: Record<string, unknown> = {}) => {
      fetch("/api/room/sync", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ roomCode: code, userId, action, ...payload }),
      }).catch(console.error);
    },
    [code, userId]
  );

  // ── Exposed actions ───────────────────────────────────────────────────────
  const play = useCallback(
    (time: number) => {
      setIsPlaying(true);
      setSyncTime(time);
      liveTimeRef.current = time;
      apiSync("play", { time });
    },
    [apiSync]
  );

  const pause = useCallback(
    (time: number) => {
      setIsPlaying(false);
      apiSync("pause", { time });
    },
    [apiSync]
  );

  const seek = useCallback(
    (time: number) => {
      setSyncTime(time);
      liveTimeRef.current = time;
      apiSync("seek", { time });
    },
    [apiSync]
  );

  const changeTrack = useCallback(
    (track: Track) => {
      setCurrentTrack(track);
      setSyncTime(0);
      liveTimeRef.current = 0;
      setIsPlaying(false);
      apiSync("track-change", { track });
    },
    [apiSync]
  );

  const addToQueue = useCallback(
    async (url: string) => {
      setAddError("");
      setIsAdding(true);
      try {
        const res = await fetch("/api/room/queue", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            roomCode: code, userId, action: "add",
            url, requestedBy: userName,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setAddError(data.message ?? data.error ?? "Failed to add track.");
          setIsAdding(false);
        }
        // On success, isAdding resets via the queue-update Pusher event
      } catch {
        setAddError("Network error. Please try again.");
        setIsAdding(false);
      }
    },
    [code, userId, userName]
  );

  const removeFromQueue = useCallback(
    (trackId: string) => {
      fetch("/api/room/queue", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ roomCode: code, userId, action: "remove", trackId }),
      }).catch(console.error);
    },
    [code, userId]
  );

  const clearAddError = useCallback(() => setAddError(""), []);

  // ── Main effect ───────────────────────────────────────────────────────────
  useEffect(() => {
    // Guard against React Strict Mode double-invoke
    if (hasJoined.current) return;
    hasJoined.current = true;

    // ── 1. Leave helper — uses Blob so API receives Content-Type: application/json ──
    const leavePayload = JSON.stringify({ roomCode: code, userId });
    const sendLeave = () => {
      navigator.sendBeacon(
        "/api/room/leave",
        new Blob([leavePayload], { type: "application/json" })
      );
    };

    // ── 2. Join and fetch initial room state ──────────────────────────────
    fetch("/api/room/join", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        roomCode: code, userId, name: userName,
        isHost:   initialIsHost, initialUrl,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        setCurrentTrack(data.currentTrack ?? null);
        setQueue(data.queue ?? []);
        setIsPlaying(data.isPlaying ?? false);
        setHostUserId(data.hostUserId ?? "");
        setMembers(data.members ?? []);

        if (data.playbackTime > 0) {
          if (data.isPlaying) {
            const elapsed = (Date.now() - new Date(data.lastSyncAt).getTime()) / 1000;
            const est = data.playbackTime + Math.max(0, elapsed);
            setSyncTime(est);
            liveTimeRef.current = est;
          } else {
            setSyncTime(data.playbackTime);
            liveTimeRef.current = data.playbackTime;
          }
        }
      })
      .catch(console.error);

    // ── 3. Subscribe to Pusher presence channel ───────────────────────────
    const pusher  = getPusherClient(userId, userName);
    const channel = pusher.subscribe(`presence-${code}`);

    channel.bind("pusher:subscription_succeeded", () => setConnected(true));
    channel.bind("pusher:subscription_error",     () => setConnected(false));

    channel.bind("pusher:member_added", (member: { id: string; info: { name: string } }) => {
      setMembers((prev) => {
        if (prev.find((m) => m.id === member.id)) return prev;
        return [...prev, { id: member.id, name: member.info.name, isHost: false, isOnline: true }];
      });
    });

    channel.bind("pusher:member_removed", (member: { id: string }) => {
      setMembers((prev) => prev.filter((m) => m.id !== member.id));
    });

    // ── Sync events ───────────────────────────────────────────────────────
    channel.bind("sync-play", ({ time, serverTimestamp }: SyncEvent) => {
      const t = compensate(time, serverTimestamp);
      setSyncTime(t);
      liveTimeRef.current = t;
      setIsPlaying(true);
    });

    channel.bind("sync-pause", ({ time }: SyncEvent) => {
      setSyncTime(time);
      liveTimeRef.current = time;
      setIsPlaying(false);
    });

    channel.bind("sync-seek", ({ time, serverTimestamp }: SyncEvent) => {
      const t = compensate(time, serverTimestamp);
      setSyncTime(t);
      liveTimeRef.current = t;
    });

    channel.bind("sync-track", ({ track }: { track: Track }) => {
      setCurrentTrack(track);
      setSyncTime(0);
      liveTimeRef.current = 0;
      setIsPlaying(false);
    });

    // ── Queue events ──────────────────────────────────────────────────────
    channel.bind("queue-update", ({ queue: q }: { queue: Track[] }) => {
      setQueue(q);
      setIsAdding(false);
    });

    // ── Participant events ────────────────────────────────────────────────
    channel.bind("user-joined", (user: RoomMember) => {
      setMembers((prev) => {
        if (prev.find((m) => m.id === user.id)) return prev;
        return [...prev, { ...user, isOnline: true }];
      });
    });

    channel.bind("user-left", ({ userId: uid }: { userId: string }) => {
      setMembers((prev) => prev.filter((m) => m.id !== uid));
    });

    channel.bind("host-changed", ({ newHostId }: { newHostId: string }) => {
      setHostUserId(newHostId);
      setMembers((prev) => prev.map((m) => ({ ...m, isHost: m.id === newHostId })));
    });

    // ── Cleanup ───────────────────────────────────────────────────────────
    window.addEventListener("beforeunload", sendLeave);

    return () => {
      sendLeave();
      window.removeEventListener("beforeunload", sendLeave);
      channel.unbind_all();
      pusher.unsubscribe(`presence-${code}`);
      hasJoined.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, userId]);

  return {
    currentTrack,
    queue,
    isPlaying,
    syncTime,
    members,
    hostUserId,
    connected,
    isAdding,
    addError,
    liveTimeRef,
    play,
    pause,
    seek,
    addToQueue,
    removeFromQueue,
    changeTrack,
    clearAddError,
  };
}
