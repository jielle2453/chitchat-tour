"use client";
// One walking session as the Walk screen sees it: the walk engine, the discovery sheet, spoken playback with
// subtitle progress, and the walk record that feeds the notebook.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createGpsSource, createSimulatedSource, type SimulatedSource } from "@/lib/geo";
import type { TriggerConfig } from "@/lib/trigger";
import type { AskResponse, DetectedObject, Discovery, DiscoveryOrigin, ExplainRequest, GeoFix, LocationSource, Narration, RouteDef, UserProfile, WalkRecord } from "@/lib/types";
import { postJson } from "./api";
import { unlockAudio } from "./audio";
import { pauseSpeaking, resumeSpeaking, setSpeechRate, speak, speechProgress, stopSpeaking } from "./speech";
import { addHeard, notebookItemIds, readWalks, removeWalk, saveDiscovery, upsertWalk, useDiscoveries, useHeard, useToday } from "./storage";
import { sanitizeQuietS } from "./storageFormat";
import { estimateSpeechMs } from "./text";
import tokyoWalk from "@data/demo/tokyo-walk.json";
import { useDiscover } from "./useDiscover";
import { useWalk } from "./useWalk";
import { appendThinned, dayKey, hiddenTooLong, type LatLon } from "./walkPath";
import { startWakeLock, stopWakeLock } from "./wakelock";
import type { WalkDestination } from "./useDestinationWalk";

export type SheetState = "hidden" | "open" | "mini";
export type PlayState = "idle" | "loading" | "playing" | "paused";

export interface SessionOptions {
  profile: UserProfile;
  quietS: number;
  voiceRate: number;
  speak: boolean; // false = silent session (compare mode second phone): subtitles run on a virtual clock
  sim: RouteDef | null; // simulated walk on this route
  persist: boolean; // write walk records and the heard list
  storageKey: string;
}

// Quiet-stretch filler thresholds: an area fact after 2 min of quiet, a national fact after 4 min.
export const AREA_IDLE_MS = 120_000;
export const NATIONAL_IDLE_MS = 240_000;

export function triggerConfig(quietS: number): TriggerConfig {
  return {
    cooldownMs: sanitizeQuietS(quietS) * 1000,
    maxCandidates: 5,
    nationalItemIdleMs: NATIONAL_IDLE_MS,
    areaItemIdleMs: AREA_IDLE_MS,
  };
}

// Simulated walks move fast; keep a short fixed quiet so the demo keeps talking.
export function simTriggerConfig(quietS: number): TriggerConfig {
  return {
    cooldownMs: Math.min(sanitizeQuietS(quietS), 10) * 1000,
    maxCandidates: 5,
    nationalItemIdleMs: 60_000,
    areaItemIdleMs: 60_000,
  };
}


interface ReplayEvent {
  atM: number;
  narration: Narration;
}
const REPLAY: ReplayEvent[] = (tokyoWalk as unknown as { events: ReplayEvent[] }).events;

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
  const [saveFailedAt, setSaveFailedAt] = useState<number | null>(null);

  const recordRef = useRef<WalkRecord | null>(null);
  const pointsSinceSaveRef = useRef(0);
  const simSourceRef = useRef<SimulatedSource | null>(null);
  const playKeyRef = useRef(0);
  const elapsedRef = useRef(0);
  const pendingStickerRef = useRef<string | undefined>(undefined);
  const hiddenAtRef = useRef<number | null>(null);
  const simSpeedRef = useRef(1);
  const [destMode, setDestMode] = useState(false);
  const [routeCorridor, setRouteCorridor] = useState<[number, number][] | null>(null);

  // Simulated walks replay a pre-recorded walk (data/demo): the live guide stays silent.
  const baseCfg = triggerConfig(options.quietS);
  // Destination mode: the guide talks a bit less, turns do the talking.
  const cfg: TriggerConfig = destMode ? { ...baseCfg, cooldownMs: Math.round(baseCfg.cooldownMs * 1.5) } : baseCfg;

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
      if (optsRef.current.persist) {
        addHeard(d);
        // every story goes straight into the notebook as a sticker
        if (!saveDiscovery(d)) setSaveFailedAt(Date.now());
      }
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
    knownItemIds: () => (optsRef.current.persist ? notebookItemIds() : []),
    autoGuide: !options.sim,
  });

  // The walk cooldown counts from the END of a narration: whenever playback
  // goes idle (finished, skipped, stopped, or cut off), stamp it into the walk.
  const walkRef = useRef(walk);
  useEffect(() => {
    walkRef.current = walk;
    if (playback.state === "idle") walkRef.current.markNarrationEnded();
  }, [walk, playback.state]);

  // ---------- live discovery: research places ahead, deliver when close ----------
  // KB point matches always win: KB-covered POIs are never researched, and a
  // cached live narration only speaks when no KB pin is waiting nearby.
  const discover = useDiscover({
    profile: options.profile,
    fix: walk.fix,
    running: active && walk.status === "running" && !options.sim,
    canSpeak: active && walk.status === "running" && !walk.busy && playback.state === "idle",
    kbPins: walk.pins,
    onDeliver: (n) => present(n, "guide", walk.getFix()),
    routeCorridor,
  });
  // ---------- demo replay: deliver each recorded story where it was recorded ----------
  const replayNextRef = useRef(0);
  useEffect(() => {
    if (!active) replayNextRef.current = 0;
  }, [active]);
  useEffect(() => {
    if (!options.sim || !active || walk.status !== "running" || playback.state !== "idle") return;
    const ev = REPLAY[replayNextRef.current];
    if (!ev || distanceM < ev.atM) return;
    replayNextRef.current += 1;
    walk.push({ ...ev.narration, id: uid("r") }, "guide", [{ kind: "decision", message: `Replaying the recorded story "${ev.narration.title}" (recorded at ${ev.atM} m).`, at: Date.now() }]);
  }, [options.sim, active, walk, playback.state, distanceM]);

  const walkWithTrace = useMemo(() => {
    if (discover.trace.length === 0) return walk;
    return { ...walk, trace: [...walk.trace, ...discover.trace].sort((a, b) => a.at - b.at).slice(-300) };
  }, [walk, discover.trace]);

  // ---------- lifecycle ----------
  const launch = useCallback(
    (
      makeSource: () => LocationSource,
      opts: { reset: boolean; simulated: boolean; mode: "wander" | "destination"; destination: WalkDestination | null },
    ) => {
      // called from a click: audio and wake lock must be set up synchronously here
      unlockAudio();
      startWakeLock();
      const rec: WalkRecord = {
        id: uid("w"),
        startedAt: Date.now(),
        endedAt: null,
        areaName: null,
        distanceM: 0,
        path: [],
        discoveryIds: [],
        simulated: opts.simulated,
      };
      recordRef.current = rec;
      setPath([]);
      setDistanceM(0);
      setActive(true);
      simSourceRef.current = null;
      walk.start(makeSource, { reset: opts.reset });
      flushRecord();
      // Mode + destination ride on the walk record (lead-owned contract).
      rec.mode = opts.mode;
      const dest = opts.destination;
      rec.destination = dest ? { name: dest.name, lat: dest.lat, lon: dest.lon } : null;
    },
    [walk, flushRecord],
  );

  const simFactory = useCallback(
    (route: RouteDef) => () => {
      const s = createSimulatedSource(route);
      s.setSpeedMultiplier(simSpeedRef.current);
      simSourceRef.current = s;
      return s;
    },
    [],
  );

  const begin = useCallback(() => {
    const o = optsRef.current;
    setDestMode(false);
    setRouteCorridor(null);
    const route = o.sim;
    launch(route ? simFactory(route) : () => createGpsSource(), {
      reset: !!route,
      simulated: !!route,
      mode: "wander",
      destination: null,
    });
  }, [launch, simFactory]);

  // Destination walk: in demo mode the computed route is simulated so the
  // demo works indoors; otherwise the walk follows GPS along the route.
  const beginDestination = useCallback(
    (def: RouteDef, dest: WalkDestination) => {
      const demo = !!optsRef.current.sim;
      setDestMode(true);
      setRouteCorridor(def.coordinates);
      launch(demo ? simFactory(def) : () => createGpsSource(), {
        reset: false,
        simulated: demo,
        mode: "destination",
        destination: dest,
      });
    },
    [launch, simFactory],
  );

  // Stop the current narration without hiding its card, so an urgent turn
  // cue can speak. The narration stays on screen for replay.
  const interruptForCue = useCallback(() => {
    playKeyRef.current++;
    stopSpeaking();
    setPlayback((p) => (p.state === "playing" || p.state === "loading" ? { ...p, state: "idle" } : p));
    setProgress(0);
  }, []);


  const end = useCallback(() => {
    walk.stop();
    stopWakeLock();
    stopSpeaking();
    const rec = recordRef.current;
    if (rec) {
      rec.endedAt = Date.now();
      flushRecord();
      // a walk that collected no stickers is not kept
      if (optsRef.current.persist && !readWalks().find((w) => w.id === rec.id)?.discoveryIds.length) removeWalk(rec.id);
    }
    recordRef.current = null;
    simSourceRef.current = null;
    setActive(false);
    setDestMode(false);
    setRouteCorridor(null);
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
    async (obj: Pick<DetectedObject, "label" | "itemId">, stickerDataUrl?: string, origin: "photo" | "guide" = "photo"): Promise<boolean> => {
      unlockAudio();
      stopSpeaking();
      setExplaining(true);
      try {
        const req: ExplainRequest = { profile: optsRef.current.profile, label: obj.label, itemId: obj.itemId, fix: walk.getFix() ?? undefined };
        const res = await postJson<AskResponse>("/api/explain", req);
        pendingStickerRef.current = stickerDataUrl;
        walk.push(res.narration, origin, res.trace);
        if (origin === "photo") walk.recordSighting(obj.label, "photo");
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
    walk: walkWithTrace,
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
    saveFailedAt,
    explaining,
    simSpeed,
    simPlaying: walk.status === "running",
    begin,
    beginDestination,
    interruptForCue,
    destMode,
    setDestinationMode: setDestMode,
    setRouteCorridor,
    live: discover.researched,
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
