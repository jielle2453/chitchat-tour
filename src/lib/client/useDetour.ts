"use client";
// Wander-mode detours: when live discovery already holds a narration for a
// high-ranked POI off the current heading, occasionally suggest a detour.
// Max ~1 per 5 minutes, max 3 per walk.
import { useEffect, useRef, useState } from "react";
import type { GeoFix, Lang, Narration, NearbyPoi } from "@/lib/types";
import { DETOUR_GAP_MS, DETOUR_MAX_PER_WALK, detourText, selectDetourCandidate, type DetourDir } from "./navEngine";
import { speak } from "./speech";

export interface DetourEntry {
  poi: NearbyPoi;
  narration: Narration | null;
}

export interface DetourSuggestion {
  poi: NearbyPoi;
  narration: Narration;
  dir: DetourDir;
  text: string;
}

export interface UseDetourOptions {
  entries: DetourEntry[];
  heardNarrationIds: readonly string[]; // narrations already delivered
  fix: GeoFix | null;
  active: boolean; // a wander walk is running
  canSpeak: boolean; // nothing playing, guide idle
  lang: Lang;
  onTake: (poi: NearbyPoi) => void;
}

export function useDetour(options: UseDetourOptions) {
  const [suggestion, setSuggestion] = useState<DetourSuggestion | null>(null);

  const optsRef = useRef(options);
  useEffect(() => {
    optsRef.current = options;
  });
  const skipRef = useRef<Set<string>>(new Set());
  const lastAtRef = useRef(0);
  const countRef = useRef(0);
  const wasActiveRef = useRef(false);

  const { fix, active, canSpeak, entries } = options;

  useEffect(() => {
    const o = optsRef.current;
    if (o.active && !wasActiveRef.current) {
      skipRef.current = new Set();
      lastAtRef.current = 0;
      countRef.current = 0;
      setSuggestion(null);
    }
    wasActiveRef.current = o.active;
    if (suggestion) return; // a card is already on screen
    if (!o.active || !o.fix || !o.canSpeak) return;
    if (countRef.current >= DETOUR_MAX_PER_WALK) return;
    if (Date.now() - lastAtRef.current < DETOUR_GAP_MS) return;
    const heard = new Set(o.heardNarrationIds);
    const ready = new Set(o.entries.filter((e) => e.narration && !heard.has(e.narration.id)).map((e) => e.poi.id));
    const pick = selectDetourCandidate(
      o.entries.map((e) => e.poi),
      o.fix,
      ready,
      skipRef.current,
    );
    if (!pick) return;
    const entry = o.entries.find((e) => e.poi.id === pick.poi.id);
    if (!entry?.narration) return;
    const name = pick.poi.name ?? pick.poi.brand ?? entry.narration.title;
    const text = detourText(name, pick.dir, o.lang);
    lastAtRef.current = Date.now();
    countRef.current += 1;
    setSuggestion({ poi: pick.poi, narration: entry.narration, dir: pick.dir, text });
    void speak(text, o.lang).catch(() => undefined);
  }, [fix, active, canSpeak, entries, suggestion]);

  const take = () => {
    const o = optsRef.current;
    setSuggestion((s) => {
      if (s) {
        skipRef.current.add(s.poi.id);
        o.onTake(s.poi);
      }
      return null;
    });
  };

  const dismiss = () => {
    setSuggestion((s) => {
      if (s) skipRef.current.add(s.poi.id);
      return null;
    });
  };

  return { suggestion, take, dismiss };
}

export type Detour = ReturnType<typeof useDetour>;
