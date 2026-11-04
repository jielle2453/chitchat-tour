"use client";
// One audio element + one AudioContext, unlocked inside the "Start" click and reused for all speech.
import { useSyncExternalStore } from "react";
import { encodeWav } from "./wav";

let ctx: AudioContext | null = null;
let el: HTMLAudioElement | null = null;
let silentUrl: string | null = null;
let watching = false;
let needsTap = false;
const listeners = new Set<() => void>();
let resumeWaiters: (() => void)[] = [];

function emit() {
  listeners.forEach((l) => l());
}

function setNeedsTap(v: boolean) {
  if (needsTap !== v) {
    needsTap = v;
    emit();
  }
}

export function getAudioElement(): HTMLAudioElement {
  if (!el) {
    el = new Audio();
    el.preload = "auto";
    el.setAttribute("playsinline", "");
  }
  return el;
}

function silentWavUrl(): string {
  if (!silentUrl) {
    const blob = new Blob([encodeWav(new Float32Array(1600), 16000)], { type: "audio/wav" });
    silentUrl = URL.createObjectURL(blob);
  }
  return silentUrl;
}

function checkContext() {
  if (!watching || !ctx) return;
  if (ctx.state !== "running") {
    ctx.resume().catch(() => undefined);
    // "interrupted" (iOS) or still suspended: ask for a tap.
    setTimeout(() => {
      if (ctx && ctx.state !== "running") setNeedsTap(true);
    }, 300);
  }
}

// The shared AudioContext for music and sound effects; created on demand
// (it starts suspended outside a gesture and is resumed on the next tap).
export function getAudioContext(): AudioContext | null {
  if (!ctx) {
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) {
        ctx = new Ctor();
        ctx.onstatechange = checkContext;
      }
    } catch {
      return null;
    }
  }
  return ctx;
}

// Call synchronously from a click handler.
export function unlockAudio() {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor && !ctx) {
      ctx = new Ctor();
      ctx.onstatechange = checkContext;
    }
    ctx?.resume().catch(() => undefined);
    if (ctx) {
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, 22050);
      src.connect(ctx.destination);
      src.start(0);
    }
  } catch {
    // keep going: the audio element may still work
  }
  try {
    const a = getAudioElement();
    a.src = silentWavUrl();
    a.play().catch(() => undefined);
  } catch {
    // ignore
  }
  try {
    // iOS needs speechSynthesis to be primed by a gesture too
    window.speechSynthesis?.speak(new SpeechSynthesisUtterance(""));
  } catch {
    // ignore
  }
  if (!watching) {
    watching = true;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") checkContext();
    });
  }
  setNeedsTap(false);
}

// Called by speech when play() is rejected for lack of a gesture; resolves after the user taps.
export function reportBlocked(): Promise<void> {
  setNeedsTap(true);
  return new Promise((resolve) => resumeWaiters.push(resolve));
}

export function resumeAudio() {
  unlockAudio();
  setNeedsTap(false);
  const waiters = resumeWaiters;
  resumeWaiters = [];
  waiters.forEach((w) => w());
}

export function useAudioNeedsTap(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => needsTap,
    () => false,
  );
}
