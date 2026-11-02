"use client";
// One walking session as the Walk screen sees it: the walk engine, the discovery sheet, spoken playback with
// subtitle progress, and the walk record that feeds the notebook.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createGpsSource, createSimulatedSource, type SimulatedSource } from "@/lib/geo";
import type { TriggerConfig } from "@/lib/trigger";
import type { AskResponse, DetectedObject, Discovery, DiscoveryOrigin, ExplainRequest, GeoFix, Narration, RouteDef, UserProfile, WalkRecord } from "@/lib/types";
import { postJson } from "./api";
import { unlockAudio } from "./audio";
import { pauseSpeaking, resumeSpeaking, setSpeechRate, speak, speechProgress, stopSpeaking } from "./speech";
import { addHeard, readWalks, saveDiscovery, upsertWalk, useDiscoveries, useHeard, useToday } from "./storage";
import type { Frequency } from "./storageFormat";
import { estimateSpeechMs } from "./text";
import { useWalk } from "./useWalk";
import { appendThinned, dayKey, hiddenTooLong, type LatLon } from "./walkPath";
import { startWakeLock, stopWakeLock } from "./wakelock";

export type SheetState = "hidden" | "open" | "mini";
export type PlayState = "idle" | "loading" | "playing" | "paused";

export interface SessionOptions {
  profile: UserProfile;
  frequency: Frequency;
  voiceRate: number;
  speak: boolean; // false = silent session (compare mode second phone): subtitles run on a virtual clock
  sim: RouteDef | null; // simulated walk on this route
  persist: boolean; // write walk records and the heard list
  storageKey: string;
}

const COOLDOWN_S: Record<Frequency, number> = { often: 60, normal: 150, rarely: 300 };
export const SIM_CFG: TriggerConfig = { cooldownMs: 20_000, maxCandidates: 5, nationalItemIdleMs: 60_000 };

export function triggerConfig(frequency: Frequency): TriggerConfig {
  const ms = COOLDOWN_S[frequency] * 1000;
  return { cooldownMs: ms, maxCandidates: 5, nationalItemIdleMs: Math.round(ms * 1.6) };
}

let counter = 0;
const uid = (prefix: string) => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`;

export function useGuideSession(options: SessionOptions) {
  const optsRef = useRef(options);
  useEffect(() => {
    optsRef.current = options;
    setSpeechRate(options.voiceRate);
  });

  const [active, setActive] = useState(false);
  const [path, setPath] = useState<LatLon[]>([]);
  const [distanceM, setDistanceM] = useState(0);
  const [current, setCurrent] = useState<Discovery | null>(null);
  const [sheet, setSheet] = useState<SheetState>("hidden");
  const [mem, setMem] = useState<Discovery[]>([]);
  const [playback, setPlayback] = useState<{ state: PlayState; key: number; durationMs: number }>({ state: "idle", key: 0, durationMs: 5000 });
  const [progress, setProgress] = useState(0);
  const [simSpeed, setSimSpeedState] = useState(1);
  const [explaining, setExplaining] = useState(false);

  const recordRef = useRef<WalkRecord | null>(null);
  const pointsSinceSaveRef = useRef(0);
  const simSourceRef = useRef<SimulatedSource | null>(null);
  const playKeyRef = useRef(0);
  const elapsedRef = useRef(0);
  const pendingStickerRef = useRef<string | undefined>(undefined);
  const hiddenAtRef = useRef<number | null>(null);
  const simSpeedRef = useRef(1);

  const cfg = options.sim ? SIM_CFG : triggerConfig(options.frequency);

  // ---------- walk record ----------
  const flushRecord = useCallback(() => {
    const rec = recordRef.current;
    if (!rec || !optsRef.current.persist) return;
    const stored = readWalks().find((w) => w.id === rec.id);
    upsertWalk({ ...rec, discoveryIds: stored?.discoveryIds ?? rec.discoveryIds });
    pointsSinceSaveRef.current = 0;
  }, []);

  const onFix = useCallback(
    (fix: GeoFix, areaName: string | null) => {
      const rec = recordRef.current;
      if (!rec) return;
      const { path: next, addedM } = appendThinned(rec.path, fix.lat, fix.lon);
      if (next !== rec.path) {
        rec.path = next;
        rec.distanceM += addedM;
        setPath(next);
        setDistanceM(rec.distanceM);
        pointsSinceSaveRef.current++;
      }
      if (areaName && !rec.areaName) rec.areaName = areaName;
      if (pointsSinceSaveRef.current >= 6) flushRecord();
    },
    [flushRecord],
  );

  // ---------- playback ----------
  const startPlayback = useCallback((d: Discovery) => {
    const o = optsRef.current;
    const key = ++playKeyRef.current;
    elapsedRef.current = 0;
    setProgress(0);
    const estimate = estimateSpeechMs(d.narration.text, d.narration.lang, o.voiceRate);
    stopSpeaking();
    if (o.speak) {
      setPlayback({ state: "loading", key, durationMs: estimate });
      void speak(d.narration.text, d.narration.lang, {
        onStart: (dur) => {
          if (key !== playKeyRef.current) return;
          setPlayback({ state: "playing", key, durationMs: dur ?? estimate });
        },
      }).then(() => {
        if (key !== playKeyRef.current) return;
        setProgress(1);
        setPlayback((p) => ({ ...p, state: "idle" }));
      });
    } else {
      setPlayback({ state: "playing", key, durationMs: estimate });
    }
  }, []);

  // progress ticker for subtitles
  useEffect(() => {
    if (playback.state !== "playing") return;
    let last = performance.now();
    const speaking = optsRef.current.speak;
    const id = setInterval(() => {
      const n = performance.now();
      elapsedRef.current += n - last;
      last = n;
      const real = speaking ? speechProgress() : null;
      let f = real ?? elapsedRef.current / playback.durationMs;
      if (speaking && real === null) f = Math.min(f, 0.97);
      if (!speaking && f >= 1) {
        f = 1;
        setPlayback((p) => (p.key === playback.key ? { ...p, state: "idle" } : p));
      }
      setProgress(Math.min(1, f));
    }, 150);
    return () => clearInterval(id);
  }, [playback.state, playback.key, playback.durationMs]);

  const present = useCallback(
    (n: Narration, origin: DiscoveryOrigin, fix: GeoFix | null) => {
      const at = Date.now();
      const d: Discovery = {
        id: `${n.id}-${at.toString(36)}${(counter++).toString(36)}`,
        narration: n,
        origin,
        at,
        lat: fix?.lat ?? null,
        lon: fix?.lon ?? null,
        walkId: recordRef.current?.id ?? null,
        stickerDataUrl: pendingStickerRef.current,
      };
      pendingStickerRef.current = undefined;
      setMem((prev) => [d, ...prev].slice(0, 40));
      if (optsRef.current.persist) addHeard(d);
      setCurrent(d);
      setSheet("open");
      startPlayback(d);
    },
    [startPlayback],
  );

  const walk = useWalk({
    profile: options.profile,
    storageKey: options.storageKey,
    persist: options.persist && !options.sim,
    cfg,
    onNarration: present,
    onFix,
  });

  // ---------- lifecycle ----------
  const begin = useCallback(() => {
    // called from a click: audio and wake lock must be set up synchronously here
    unlockAudio();
    startWakeLock();
    const o = optsRef.current;
    const rec: WalkRecord = {
      id: uid("w"),
      startedAt: Date.now(),
      endedAt: null,
      areaName: null,
      distanceM: 0,
      path: [],
      discoveryIds: [],
      simulated: !!o.sim,
    };
    recordRef.current = rec;
    setPath([]);
    setDistanceM(0);
    setActive(true);
    simSourceRef.current = null;
    const route = o.sim;
    walk.start(
      () => {
        if (route) {
          const s = createSimulatedSource(route);
          s.setSpeedMultiplier(simSpeedRef.current);
          simSourceRef.current = s;
          return s;
        }
        return createGpsSource();
      },
      { reset: !!route },
    );
    flushRecord();
  }, [walk, flushRecord]);

  const end = useCallback(() => {
    walk.stop();
    stopWakeLock();
    stopSpeaking();
    const rec = recordRef.current;
    if (rec) {
      rec.endedAt = Date.now();
      flushRecord();
    }
    recordRef.current = null;
    simSourceRef.current = null;
    setActive(false);
    setPlayback((p) => ({ ...p, state: "idle" }));
  }, [walk, flushRecord]);

  // end a walk that was left alone for more than 30 minutes
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        flushRecord();
      } else {
        if (recordRef.current && hiddenTooLong(hiddenAtRef.current, Date.now())) end();
        hiddenAtRef.current = null;
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [end, flushRecord]);

  // ---------- sheet and playback controls ----------
  const togglePlay = useCallback(() => {
    if (playback.state === "playing") {
      if (optsRef.current.speak) pauseSpeaking();
      setPlayback((p) => ({ ...p, state: "paused" }));
    } else if (playback.state === "paused") {
      if (optsRef.current.speak) resumeSpeaking();
      setPlayback((p) => ({ ...p, state: "playing" }));
    } else if (current) {
      unlockAudio();
      startPlayback(current);
    }
  }, [playback.state, current, startPlayback]);

  const replay = useCallback(
    (d: Discovery) => {
      unlockAudio();
      setCurrent(d);
      setSheet("open");
      startPlayback(d);
    },
    [startPlayback],
  );

  const skip = useCallback(() => {
    playKeyRef.current++;
    stopSpeaking();
    setPlayback((p) => ({ ...p, state: "idle" }));
    setSheet("hidden");
    setCurrent(null);
  }, []);

  const stick = useCallback((): boolean => {
    if (!current || !optsRef.current.persist) return false;
    return saveDiscovery(current);
  }, [current]);

  // ---------- asking ----------
  const askText = useCallback(
    async (q: string) => {
      unlockAudio();
      await walk.ask(q);
    },
    [walk],
  );

  const tellMore = useCallback(() => {
    unlockAudio();
    walk.tellMeMore();
  }, [walk]);

  const explain = useCallback(
    async (obj: Pick<DetectedObject, "label" | "itemId">, stickerDataUrl?: string): Promise<boolean> => {
      unlockAudio();
      stopSpeaking();
      setExplaining(true);
      try {
        const req: ExplainRequest = { profile: optsRef.current.profile, label: obj.label, itemId: obj.itemId, fix: walk.getFix() ?? undefined };
        const res = await postJson<AskResponse>("/api/explain", req);
        pendingStickerRef.current = stickerDataUrl;
        walk.push(res.narration, "photo", res.trace);
        return true;
      } catch {
        return false;
      } finally {
        setExplaining(false);
      }
    },
    [walk],
  );

  // ---------- simulated walk controls ----------
  const setSimSpeed = useCallback((s: number) => {
    simSpeedRef.current = s;
    setSimSpeedState(s);
    simSourceRef.current?.setSpeedMultiplier(s);
  }, []);

  const simToggle = useCallback(() => {
    if (walk.status === "running") {
      walk.pause();
    } else if (simSourceRef.current && walk.progress < 0.999) {
      unlockAudio();
      const src = simSourceRef.current;
      walk.start(() => src, { reset: false });
    }
  }, [walk]);

  // ---------- heard today ----------
  const storedHeard = useHeard();
  const saved = useDiscoveries();
  const today = useToday();
  const heardToday = useMemo(() => {
    const byId = new Map<string, Discovery>();
    for (const d of mem) byId.set(d.id, d);
    if (options.persist) for (const d of storedHeard) if (!byId.has(d.id)) byId.set(d.id, d);
    return [...byId.values()].filter((d) => today && dayKey(d.at) === today).sort((a, b) => b.at - a.at);
  }, [mem, storedHeard, today, options.persist]);
  const stuck = !!current && saved.some((d) => d.id === current.id);

  useEffect(
    () => () => {
      stopWakeLock();
      stopSpeaking();
    },
    [],
  );

  return {
    walk,
    active,
    path,
    distanceM,
    current,
    sheet,
    setSheet,
    playback,
    progress,
    heardToday,
    stuck,
    explaining,
    simSpeed,
    simPlaying: walk.status === "running",
    begin,
    end,
    togglePlay,
    replay,
    skip,
    stick,
    askText,
    tellMore,
    explain,
    setSimSpeed,
    simToggle,
  };
}

export type GuideSession = ReturnType<typeof useGuideSession>;
