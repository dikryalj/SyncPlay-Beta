/**
 * useRoom.ts — Core room hook for SyncPlay serverless architecture.
 *
 * Responsibilities:
 *  1. Fetches initial room state from Supabase via /api/room/join on mount.
 *  2. Subscribes to Pusher presence channel `presence-{roomCode}`.
 *  3. Listens for sync events (play/pause/seek/track-change/queue-update/host-changed).
 *  4. Exposes action functions (play, pause, seek, addToQueue, removeFromQueue, changeTrack).
 *  5. Calls /api/room/leave on unmount and beforeunload.
 *  6. Handles host promotion when the host's presence-member is removed.
 */

"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getPusherClient } from "@/lib/pusher";
import type { Track, RoomMember, SyncEvent } from "@/lib/types";
import type { Channel } from "pusher-js";

interface UseRoomOptions {
  code:          string;
  userId:        string;
  userName:      string;
  initialIsHost: boolean;
  initialUrl:    string;
}

interface UseRoomReturn {
  currentTrack:      Track | null;
  queue:             Track[];
  isPlaying:         boolean;
  /** Compensated sync time to push into AudioPlayer.syncTime */
  syncTime:          number | null;
  members:           RoomMember[];
  hostUserId:        string;
  connected:         boolean;
  isAdding:          boolean;
  addError:          string;
  liveTimeRef:       React.MutableRefObject<number>;
  play:              (time: number) => void;
  pause:             (time: number) => void;
  seek:              (time: number) => void;
  addToQueue:        (url: string) => Promise<void>;
  removeFromQueue:   (trackId: string) => void;
  changeTrack:       (track: Track) => void;
  clearAddError:     () => void;
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
  const channelRef  = useRef<Channel | null>(null);
  const hasJoined   = useRef(false);

  // ── Latency compensation ──────────────────────────────────────────────────
  /**
   * For Pusher delivery, we use the server timestamp embedded in every event.
   * compensate(rawTime, serverTs) adds the observed one-way delay so the
   * follower seeks to where the host *will be* when the packet arrives.
   */
  const compensate = useCallback((rawTime: number, serverTs: number): number => {
    const delaySeconds = Math.max(0, (Date.now() - serverTs)) / 1000;
    // Cap at 2s to avoid over-compensation on very slow connections
    return rawTime + Math.min(delaySeconds, 2);
  }, []);

  // ── API helpers ───────────────────────────────────────────────────────────
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

  // ── Actions exposed to the room page ─────────────────────────────────────
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
        // isAdding reset happens via queue-update Pusher event
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

  // ── Leave helper (called on unmount + beforeunload) ───────────────────────
  const leaveRoom = useCallback(() => {
    navigator.sendBeacon(
      "/api/room/leave",
      JSON.stringify({ roomCode: code, userId })
    );
  }, [code, userId]);

  // ── Main effect: join + subscribe ─────────────────────────────────────────
  useEffect(() => {
    if (hasJoined.current) return;
    hasJoined.current = true;

    // 1. Join via API and get initial state
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

        // Calculate compensated initial playback position for late joiners
        if (data.playbackTime > 0) {
          if (data.isPlaying) {
            const elapsed =
              (Date.now() - new Date(data.lastSyncAt).getTime()) / 1000;
            const estimated = data.playbackTime + Math.max(0, elapsed);
            setSyncTime(estimated);
            liveTimeRef.current = estimated;
          } else {
            setSyncTime(data.playbackTime);
            liveTimeRef.current = data.playbackTime;
          }
        }
      })
      .catch(console.error);

    // 2. Subscribe to Pusher presence channel
    const pusher  = getPusherClient(userId, userName);
    const channel = pusher.subscribe(`presence-${code}`);
    channelRef.current = channel;

    channel.bind("pusher:subscription_succeeded", () => setConnected(true));
    channel.bind("pusher:subscription_error",     () => setConnected(false));

    // ── Presence events ───────────────────────────────────────────────────
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
      setIsAdding(false); // clear loading state
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

    // ── Host promotion ────────────────────────────────────────────────────
    channel.bind("host-changed", ({ newHostId }: { newHostId: string }) => {
      setHostUserId(newHostId);
      setMembers((prev) =>
        prev.map((m) => ({ ...m, isHost: m.id === newHostId }))
      );
    });

    // ── Cleanup ───────────────────────────────────────────────────────────
    window.addEventListener("beforeunload", leaveRoom);

    return () => {
      leaveRoom();
      window.removeEventListener("beforeunload", leaveRoom);
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
