"use client";
// Walk engine: location fixes -> trigger engine -> /api/guide, plus spoken questions (/api/transcribe + /api/ask).
// It never plays audio itself: narrations are handed to `onNarration`, so the session decides how to present them.
import { useCallback, useEffect, useRef, useState } from "react";
import { areaNameAt, nearbyPois } from "@/lib/geo";
import { getItem, getKnowledgeItems } from "@/lib/kb";
import { addSighting, findConceptsInText, rankCandidates, shouldSpeak, type TriggerConfig } from "@/lib/trigger";
import type {
  AskRequest,
  AskResponse,
  Candidate,
  DiscoveryOrigin,
  GeoFix,
  GuideRequest,
  GuideResponse,
  LocationSource,
  Narration,
  NearbyPoi,
  TraceStep,
  TranscribeResponse,
  UserProfile,
  WalkState,
} from "@/lib/types";
import { isNotReady, postForm, postJson } from "./api";
import { ASK_ACK_DELAY_MS, ASK_ACK_FINISH_TIMEOUT_MS, pickAskAck } from "./askAck";
import { t } from "./i18n";
import { startRecording, type Recording } from "./recorder";
import { speak, stopSpeaking } from "./speech";
import { readStored, writeStored } from "./storage";
import { KEYS } from "./storageFormat";

export type WalkStatus = "idle" | "running" | "paused" | "error";
export type VoiceState = "idle" | "listening" | "transcribing" | "thinking";

export interface Pin {
  poiId: string;
  itemId: string;
  lat: number;
  lon: number;
  label: string;
}

export interface WalkOptions {
  profile: UserProfile;
  storageKey?: string; // where WalkState is persisted
  persist?: boolean;
  cfg?: TriggerConfig;
  onNarration?: (narration: Narration, origin: DiscoveryOrigin, fix: GeoFix | null) => void;
  onFix?: (fix: GeoFix, areaName: string | null) => void;
  knownItemIds?: () => string[]; // stories already in the notebook: never told again
  autoGuide?: boolean; // false: never asks the guide on its own (replayed demo walks)
}

const RADIUS_M = 150;
const MAX_ASK_SIGHTINGS = 3;

// Routine position/user chatter is only worth a trace line when something
// changed (new candidate set, new area) or at most every ~60 s.
export const ROUTINE_TRACE_MS = 60_000;

export function routineTraceKey(areaName: string | null, candidates: { itemId: string }[]): string {
  return `${areaName ?? "?"}|${candidates.map((c) => c.itemId).join(",")}`;
}

export function shouldEmitRoutineTrace(prev: { at: number; key: string } | null, key: string, nowMs: number): boolean {
  return !prev || prev.key !== key || nowMs - prev.at >= ROUTINE_TRACE_MS;
}

// Routine steps the server restates on every guide call.
export function isRoutineStep(kind: TraceStep["kind"]): boolean {
  return kind === "position" || kind === "user";
}

// Concepts worth remembering from a spoken question: the answered item's own
// photo concepts first (mapped back from the answer's itemId), then any known
// photo concepts mentioned verbatim in the question text.
function askSightings(question: string, itemId: string | null): string[] {
  const answered = itemId ? getItem(itemId) : undefined;
  const concepts = answered?.trigger.photo_concepts;
  const q = question.toLowerCase();
  const answerConcept = concepts?.find((c) => q.includes(c.toLowerCase())) ?? concepts?.[0];
  const known = getKnowledgeItems().flatMap((i) => i.trigger.photo_concepts ?? []);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of [...(answerConcept ? [answerConcept] : []), ...findConceptsInText(question, known)]) {
    const key = c.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length >= MAX_ASK_SIGHTINGS) break;
  }
  return out;
}
const MAX_TRACE = 300;
const MAX_PINS = 3;
const EMPTY_STATE: WalkState = { toldItemIds: [], lastSpokenAt: null, history: [] };

// Pure narration bookkeeping, exported for tests. The cooldown counts from the
// END of a narration: delivery stamps the start (so a restart keeps a sane
// value), and applyGuideEnd moves the stamp to the moment playback ended.
export function applyGuideStart(state: WalkState, itemId: string | null, at: number): WalkState {
  return {
    toldItemIds: itemId && !state.toldItemIds.includes(itemId) ? [...state.toldItemIds, itemId] : state.toldItemIds,
    lastSpokenAt: at,
    history: itemId ? [...state.history, { itemId, at }] : state.history,
  };
}

export function applyGuideEnd(state: WalkState, at: number): WalkState {
  return { ...state, lastSpokenAt: at };
}

function now() {
  return Date.now();
}

export function useWalk(options: WalkOptions) {
  const optsRef = useRef(options);
  useEffect(() => {
    optsRef.current = options;
  });

  const [fix, setFix] = useState<GeoFix | null>(null);
  const [area, setArea] = useState<string | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [checked, setChecked] = useState<{ poiId: string; lat: number; lon: number }[]>([]);
  const [progress, setProgress] = useState(0);
  const [trace, setTrace] = useState<TraceStep[]>([]);
  const [status, setStatus] = useState<WalkStatus>("idle");
  const [error, setError] = useState<{ message: string; notReady: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [voice, setVoice] = useState<VoiceState>("idle");
  const [heard, setHeard] = useState<string | null>(null);

  const sourceRef = useRef<LocationSource | null>(null);
  const tokenRef = useRef(0);
  const busyRef = useRef(false);
  const stateRef = useRef<WalkState>(EMPTY_STATE);
  const fixRef = useRef<GeoFix | null>(null);
  const poisRef = useRef<NearbyPoi[]>([]);
  const candidatesRef = useRef<Candidate[]>([]);
  const pinKeyRef = useRef("");
  const recentRef = useRef<Narration[]>([]);
  const recordingRef = useRef<Recording | null>(null);
  const askCountRef = useRef(0);
  const holdingRef = useRef(false);
  const lastRoutineRef = useRef<{ at: number; key: string } | null>(null);

  const stateKey = () => `${KEYS.walkState}.${optsRef.current.storageKey ?? "walk"}`;

  const addTrace = useCallback((steps: TraceStep[]) => {
    if (!steps.length) return;
    setTrace((prev) => [...prev, ...steps].slice(-MAX_TRACE));
  }, []);

  const fail = useCallback(
    (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      setError({ message, notReady: isNotReady(err) });
      setStatus("error");
      tokenRef.current++;
      sourceRef.current?.stop();
      addTrace([{ kind: "error", message, at: now() }]);
    },
    [addTrace],
  );

  // A narration was delivered and its playback has not ended yet. While set, no
  // new guide narration starts, so stories never overlap.
  const speakingRef = useRef(false);
  const activeOriginRef = useRef<DiscoveryOrigin | null>(null);

  const deliver = useCallback((narration: Narration, origin: DiscoveryOrigin) => {
    recentRef.current = [...recentRef.current, narration].slice(-3);
    const at = now();
    let s = stateRef.current;
    let dirty = false;
    // A new narration cuts off whatever was playing: a cut-off guide story's quiet starts now.
    if (speakingRef.current && activeOriginRef.current === "guide") {
      s = applyGuideEnd(s, at);
      dirty = true;
    }
    speakingRef.current = true;
    activeOriginRef.current = origin;
    if (origin === "guide") {
      s = applyGuideStart(s, narration.itemId, at);
      dirty = true;
      // the pin for this story becomes a check mark
      const c = candidatesRef.current.find((x) => x.itemId === narration.itemId && x.poiId);
      const poi = c ? poisRef.current.find((p) => p.id === c.poiId) : undefined;
      if (poi) setChecked((prev) => (prev.some((x) => x.poiId === poi.id) ? prev : [...prev, { poiId: poi.id, lat: poi.lat, lon: poi.lon }]));
    }
    if (dirty) {
      stateRef.current = s;
      if (optsRef.current.persist !== false) writeStored(stateKey(), s);
    }
    optsRef.current.onNarration?.(narration, origin, fixRef.current);
  }, []);

  // The session calls this when playback goes idle (finished, skipped,
  // stopped, or cut off): the quiet gap counts from here. Only guide
  // narrations move the stamp; answers to the walker's own questions never did.
  const markNarrationEnded = useCallback(() => {
    if (!speakingRef.current) return;
    speakingRef.current = false;
    if (activeOriginRef.current === "guide") {
      const s = applyGuideEnd(stateRef.current, now());
      stateRef.current = s;
      if (optsRef.current.persist !== false) writeStored(stateKey(), s);
    }
    activeOriginRef.current = null;
  }, []);

  const attempt = useCallback(
    async (f: GeoFix, areaName: string | null, nearby: NearbyPoi[], candidates: Candidate[], token: number) => {
      const o = optsRef.current;
      const t0 = now();
      const state = stateRef.current;
      const local: TraceStep[] = [
        {
          kind: "position",
          message: `${areaName ?? "Unknown area"}: ${nearby.length} places within ${RADIUS_M} m`,
          at: t0,
        },
        { kind: "user", message: `Hometown ${o.profile.hometown || "not given"}, language ${o.profile.lang}`, at: t0 },
      ];
      for (const c of candidates) {
        const item = getItem(c.itemId);
        local.push({
          kind: "candidate",
          message: `${item?.title.en ?? c.itemId} (score ${c.score.toFixed(2)}): ${c.reasons.join("; ")}`,
          at: t0,
          data: c,
        });
      }
      const routineKey = routineTraceKey(areaName, candidates);
      const emitRoutine = shouldEmitRoutineTrace(lastRoutineRef.current, routineKey, t0);
      if (emitRoutine) lastRoutineRef.current = { at: t0, key: routineKey };
      if (!candidates.length) {
        local.push({ kind: "skip", message: "Nothing nearby is worth telling this walker right now", at: t0 });
        if (emitRoutine) addTrace(local);
        return;
      }
      const req: GuideRequest = { profile: o.profile, fix: f, candidates, state, areaName };
      const res = await postJson<GuideResponse>("/api/guide", req);
      if (token !== tokenRef.current) return;
      // The agent's trace already restates position, user and candidates.
      let steps = res.trace.length ? res.trace : local;
      if (!emitRoutine) steps = steps.filter((s) => !isRoutineStep(s.kind));
      addTrace(steps);
      if (res.narration) deliver(res.narration, "guide");
    },
    [addTrace, deliver],
  );

  const handleFix = useCallback(
    (f: GeoFix, token: number, source: LocationSource) => {
      if (token !== tokenRef.current) return;
      fixRef.current = f;
      setFix(f);
      const prog = (source as { progress?: () => number }).progress;
      if (typeof prog === "function") setProgress(prog.call(source));
      let areaName: string | null = null;
      let nearby: NearbyPoi[] = [];
      let candidates: Candidate[] = [];
      let ok = false;
      try {
        areaName = areaNameAt(f);
        nearby = nearbyPois(f, RADIUS_M);
        const o = optsRef.current;
        candidates = rankCandidates({ fix: f, profile: o.profile, pois: nearby, items: getKnowledgeItems(), state: stateRef.current, now: now(), cfg: o.cfg });
        ok = o.autoGuide !== false && shouldSpeak(stateRef.current, now(), o.cfg);
      } catch (err) {
        fail(err);
        return;
      }
      setArea(areaName);
      poisRef.current = nearby;
      candidatesRef.current = candidates;
      optsRef.current.onFix?.(f, areaName);

      // anticipation pins: the best few point-layer candidates, regardless of the cooldown
      const nextPins: Pin[] = [];
      for (const c of candidates) {
        if (!c.poiId || nextPins.length >= MAX_PINS) continue;
        const poi = nearby.find((p) => p.id === c.poiId);
        if (poi) nextPins.push({ poiId: poi.id, itemId: c.itemId, lat: poi.lat, lon: poi.lon, label: poi.name ?? poi.brand ?? poi.kind });
      }
      const key = nextPins.map((p) => p.poiId).join("|");
      if (key !== pinKeyRef.current) {
        pinKeyRef.current = key;
        setPins(nextPins);
      }

      if (!ok || busyRef.current || speakingRef.current) return;
      busyRef.current = true;
      setBusy(true);
      attempt(f, areaName, nearby, candidates, token)
        .catch((err) => {
          if (isNotReady(err)) fail(err);
          else addTrace([{ kind: "error", message: err instanceof Error ? err.message : String(err), at: now() }]);
        })
        .finally(() => {
          busyRef.current = false;
          setBusy(false);
        });
    },
    [addTrace, attempt, fail],
  );

  const start = useCallback(
    (createSource: () => LocationSource, opts?: { reset?: boolean }) => {
      tokenRef.current++;
      const token = tokenRef.current;
      sourceRef.current?.stop();
      setError(null);
      if (opts?.reset) {
        stateRef.current = EMPTY_STATE;
        recentRef.current = [];
        candidatesRef.current = [];
        pinKeyRef.current = "";
        lastRoutineRef.current = null;
        speakingRef.current = false;
        activeOriginRef.current = null;
        setPins([]);
        setChecked([]);
        setTrace([]);
        setProgress(0);
        if (optsRef.current.persist !== false) writeStored(stateKey(), EMPTY_STATE);
      } else if (optsRef.current.persist !== false) {
        stateRef.current = readStored<WalkState>(stateKey(), EMPTY_STATE);
      }
      const known = optsRef.current.knownItemIds?.() ?? [];
      if (known.length) {
        const told = new Set([...stateRef.current.toldItemIds, ...known]);
        stateRef.current = { ...stateRef.current, toldItemIds: [...told] };
      }
      try {
        const source = createSource();
        sourceRef.current = source;
        source.start(
          (f) => handleFix(f, token, source),
          (err) => {
            if (token === tokenRef.current) fail(err);
          },
        );
        setStatus("running");
      } catch (err) {
        fail(err);
      }
    },
    [fail, handleFix],
  );

  const halt = useCallback((next: WalkStatus) => {
    tokenRef.current++;
    sourceRef.current?.stop();
    setStatus(next);
  }, []);
  const pause = useCallback(() => halt("paused"), [halt]);
  const stop = useCallback(() => {
    halt("idle");
    setPins([]);
    pinKeyRef.current = "";
  }, [halt]);

  const ask = useCallback(
    async (question: string) => {
      const o = optsRef.current;
      stopSpeaking();
      setVoice("thinking");
      const lang = o.profile.lang;
      const cueText = pickAskAck(lang, askCountRef.current++);
      let settled: boolean = false;
      let cueDone: Promise<void> | null = null;
      let cueStarted: boolean = false;
      const cueTimer = setTimeout(() => {
        if (settled) return;
        cueDone = speak(cueText, lang, {
          onStart: () => {
            cueStarted = true;
          },
        }).catch(() => undefined);
      }, ASK_ACK_DELAY_MS);
      try {
        const req: AskRequest = {
          profile: o.profile,
          question,
          fix: fixRef.current ?? undefined,
          recent: recentRef.current,
        };
        const res = await postJson<AskResponse>("/api/ask", req);
        settled = true;
        clearTimeout(cueTimer);
        const pendingCue: Promise<void> | null = cueDone;
        if (pendingCue && !cueStarted) {
          stopSpeaking();
        } else if (pendingCue) {
          let timer: ReturnType<typeof setTimeout> | undefined;
          const timeout = new Promise<void>((resolve) => {
            timer = setTimeout(() => {
              stopSpeaking();
              resolve();
            }, ASK_ACK_FINISH_TIMEOUT_MS);
          });
          await Promise.race([pendingCue, timeout]);
          if (timer) clearTimeout(timer);
          stopSpeaking();
        }
        addTrace(res.trace);
        deliver(res.narration, "ask");
        for (const c of askSightings(question, res.narration.itemId)) {
          stateRef.current = addSighting(stateRef.current, c, "ask", now());
        }
        if (optsRef.current.persist !== false) writeStored(stateKey(), stateRef.current);
      } catch (err) {
        settled = true;
        clearTimeout(cueTimer);
        if (cueDone) stopSpeaking();
        addTrace([{ kind: "error", message: err instanceof Error ? err.message : String(err), at: now() }]);
      } finally {
        setVoice("idle");
      }
    },
    [addTrace, deliver],
  );

  const tellMeMore = useCallback(() => {
    void ask(t(optsRef.current.profile.lang, "tellMoreQuestion"));
  }, [ask]);

  // Used by the photo flow, which calls /api/explain itself.
  const recordSighting = useCallback((concept: string, source: "photo" | "ask") => {
    const next = addSighting(stateRef.current, concept, source, now());
    stateRef.current = next;
    if (optsRef.current.persist !== false) writeStored(stateKey(), next);
  }, []);

  const push = useCallback(
    (narration: Narration, origin: DiscoveryOrigin, steps: TraceStep[] = []) => {
      addTrace(steps);
      deliver(narration, origin);
    },
    [addTrace, deliver],
  );

  const startListening = useCallback(async () => {
    if (recordingRef.current || holdingRef.current) return;
    holdingRef.current = true;
    stopSpeaking();
    setHeard(null);
    setVoice("listening");
    try {
      const rec = await startRecording();
      if (!holdingRef.current) {
        // released before the mic was ready
        rec.cancel();
        setVoice("idle");
        return;
      }
      recordingRef.current = rec;
    } catch (err) {
      holdingRef.current = false;
      setVoice("idle");
      addTrace([{ kind: "error", message: `Microphone: ${err instanceof Error ? err.message : String(err)}`, at: now() }]);
    }
  }, [addTrace]);

  const stopListening = useCallback(async () => {
    holdingRef.current = false;
    const rec = recordingRef.current;
    if (!rec) {
      setVoice((v) => (v === "listening" ? "idle" : v));
      return;
    }
    recordingRef.current = null;
    const { blob, durationMs } = await rec.stop();
    if (durationMs < 400) {
      setVoice("idle");
      return;
    }
    setVoice("transcribing");
    try {
      const form = new FormData();
      form.append("audio", blob, "question.wav");
      form.append("lang", optsRef.current.profile.lang);
      form.append("keywords", poisRef.current.map((p) => p.name ?? p.brand).filter(Boolean).join(","));
      const { text } = await postForm<TranscribeResponse>("/api/transcribe", form);
      if (!text.trim()) {
        setVoice("idle");
        return;
      }
      setHeard(text);
      await ask(text);
    } catch (err) {
      addTrace([{ kind: "error", message: err instanceof Error ? err.message : String(err), at: now() }]);
      setVoice("idle");
    }
  }, [ask, addTrace]);

  const getFix = useCallback(() => fixRef.current, []);

  useEffect(
    () => () => {
      tokenRef.current++;
      sourceRef.current?.stop();
      recordingRef.current?.cancel();
    },
    [],
  );

  return {
    fix,
    area,
    pins,
    checked,
    progress,
    trace,
    status,
    error,
    busy,
    voice,
    heard,
    start,
    pause,
    stop,
    markNarrationEnded,
    tellMeMore,
    startListening,
    stopListening,
    ask,
    recordSighting,
    push,
    getFix,
  };
}

export type WalkApi = ReturnType<typeof useWalk>;
