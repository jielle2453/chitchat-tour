"use client";
// A client-side clock for durations of still-open walks: one cached value,
// refreshed every 30 s. Render stays pure (no Date.now in render or effects).
import { useSyncExternalStore } from "react";

let cachedNow = Date.now();

function subscribe(cb: () => void): () => void {
  const t = setInterval(() => {
    cachedNow = Date.now();
    cb();
  }, 30_000);
  return () => clearInterval(t);
}

const getSnapshot = () => cachedNow;
const getServerSnapshot = () => 0;

export function useNowTick(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
