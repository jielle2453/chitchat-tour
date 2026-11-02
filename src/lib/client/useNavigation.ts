"use client";
// Turn-by-turn navigation for destination walks: cue timing, arrival,
// off-route rerouting. Speaks through the shared speech queue; the guide
// session owns narrations, this hook owns maneuvers.
import { useEffect, useRef, useState } from "react";
import type { GeoFix, Lang, WalkRoute } from "@/lib/types";
import {
  ARRIVE_M,
  CUE_AT_M,
  CUE_CLOSE_M,
  OFF_ROUTE_M,
  OFF_ROUTE_S,
  REROUTE_MIN_S,
  arrivalText,
  fetchWalkRoute,
  isOffRoute,
  navCue,
  progressOnRoute,
  type RouteProgress,
} from "./navEngine";
import { speak } from "./speech";

export interface NavDestination {
  name: string;
  label: string;
  lat: number;
  lon: number;
}

export interface UseNavigationOptions {
  route: WalkRoute | null;
  resetKey: WalkRoute | null; // identity of the route being walked: a change forgets spoken cues
  destination: NavDestination | null;
  fix: GeoFix | null;
  active: boolean; // a destination walk is running
  lang: Lang;
  speaking: boolean; // a guide narration is playing
  onInterrupt: () => void; // stop the narration so an urgent cue can speak
  onArrived: () => void;
  onRoute: (route: WalkRoute) => void; // rerouted (or initial route replaced)
  onRerouted?: () => void;
}

export interface NavCueView {
  text: string;
  distanceM: number;
  modifier?: string;
}

export function useNavigation(options: UseNavigationOptions) {
  const [progress, setProgress] = useState<RouteProgress | null>(null);
  const [cue, setCue] = useState<NavCueView | null>(null);
  const [arrived, setArrived] = useState(false);
  const [offRoute, setOffRoute] = useState(false);

  const optsRef = useRef(options);
  useEffect(() => {
    optsRef.current = options;
  });
  const spokenRef = useRef<Set<number>>(new Set());
  const pendingRef = useRef<{ index: number; text: string } | null>(null);
  const arrivedRef = useRef(false);
  const offSinceRef = useRef<number | null>(null);
  const lastRerouteRef = useRef(0);
  const reroutingRef = useRef(false);
  const progressRef = useRef<RouteProgress | null>(null);

  // New (or cleared) route: forget spoken cues and arrival. State resets
  // happen render-phase; ref resets ride along in an effect below.
  const routeKey = options.resetKey ? `${options.resetKey.coordinates.length}x${Math.round(options.resetKey.distanceM)}` : "";
  const [runKey, setRunKey] = useState(routeKey);
  if (routeKey !== runKey) {
    setRunKey(routeKey);
    setArrived(false);
    setCue(null);
    setProgress(null);
    setOffRoute(false);
  }
  useEffect(() => {
    spokenRef.current = new Set();
    pendingRef.current = null;
    arrivedRef.current = false;
    offSinceRef.current = null;
    progressRef.current = null;
  }, [runKey]);

  const { fix, active, speaking } = options;

  // A deferred cue fires as soon as the narration ends.
  useEffect(() => {
    if (speaking || !active || arrivedRef.current) return;
    const pending = pendingRef.current;
    if (!pending) return;
    const p = progressRef.current;
    if (!p || p.nextStepIndex !== pending.index) {
      pendingRef.current = null;
      return;
    }
    pendingRef.current = null;
    spokenRef.current.add(pending.index);
    void speak(pending.text, optsRef.current.lang).catch(() => undefined);
  }, [speaking, active]);

  useEffect(() => {
    const o = optsRef.current;
    if (!active || !o.route || !fix || arrivedRef.current) return;
    const route = o.route;
    const p = progressOnRoute(route, fix);
    progressRef.current = p;
    setProgress(p);

    if (p.remainingM <= ARRIVE_M) {
      arrivedRef.current = true;
      pendingRef.current = null;
      setArrived(true);
      setCue(null);
      if (o.speaking) o.onInterrupt();
      void speak(arrivalText(o.destination?.name ?? "", o.lang), o.lang).catch(() => undefined);
      o.onArrived();
      return;
    }

    const step = route.steps[p.nextStepIndex];
    if (step && step.type !== "arrive" && !spokenRef.current.has(p.nextStepIndex) && p.distanceToNextStepM <= CUE_AT_M) {
      const text = navCue(step, o.lang);
      if (!text) {
        spokenRef.current.add(p.nextStepIndex);
      } else if (o.speaking) {
        if (p.distanceToNextStepM >= CUE_CLOSE_M) {
          pendingRef.current = { index: p.nextStepIndex, text }; // wait for the narration
        } else {
          o.onInterrupt(); // too close to wait: duck the narration
          spokenRef.current.add(p.nextStepIndex);
          pendingRef.current = null;
          void speak(text, o.lang).catch(() => undefined);
        }
      } else {
        spokenRef.current.add(p.nextStepIndex);
        void speak(text, o.lang).catch(() => undefined);
      }
    }

    // Banner: the nearest upcoming speakable maneuver.
    let along = 0;
    let banner: NavCueView | null = null;
    for (let i = 0; i < route.steps.length; i++) {
      const s = route.steps[i];
      const startsAt = along;
      along += Math.max(0, s.distanceM);
      if (startsAt < p.distanceAlongM - 1) continue;
      if (s.type === "arrive") break;
      if (s.type === "depart") continue;
      const text = navCue(s, o.lang);
      if (!text) continue;
      banner = { text, distanceM: Math.max(0, startsAt - p.distanceAlongM), modifier: s.modifier };
      break;
    }
    setCue(banner);

    const off = isOffRoute(p, OFF_ROUTE_M);
    setOffRoute(off);
    const nowMs = Date.now();
    if (!off) {
      offSinceRef.current = null;
      return;
    }
    if (offSinceRef.current === null) {
      offSinceRef.current = nowMs;
      return;
    }
    if (
      nowMs - offSinceRef.current >= OFF_ROUTE_S * 1000 &&
      nowMs - lastRerouteRef.current >= REROUTE_MIN_S * 1000 &&
      !reroutingRef.current &&
      o.destination
    ) {
      reroutingRef.current = true;
      lastRerouteRef.current = nowMs;
      const dest = o.destination;
      fetchWalkRoute(fix, dest, o.lang)
        .then((next) => {
          offSinceRef.current = null;
          o.onRoute(next);
          o.onRerouted?.();
        })
        .catch(() => {
          // keep walking the old route; try again on the next window
          offSinceRef.current = Date.now();
        })
        .finally(() => {
          reroutingRef.current = false;
        });
    }
  }, [fix, active]);

  return { progress, cue, arrived, offRoute, remainingM: progress?.remainingM ?? options.route?.distanceM ?? 0 };
}

export type Navigation = ReturnType<typeof useNavigation>;
