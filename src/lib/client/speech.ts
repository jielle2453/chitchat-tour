"use client";
// Speech queue: server TTS (mp3) through the unlocked audio element, speechSynthesis as fallback.
import type { Lang } from "@/lib/types";
import { getAudioElement, reportBlocked } from "./audio";

export interface SpeakOptions {
  // Called when sound actually starts. `durationMs` is known for server TTS, null for speechSynthesis.
  onStart?: (durationMs: number | null) => void;
}

interface Job {
  text: string;
  lang: Lang;
  opts?: SpeakOptions;
  resolve: () => void;
}

let rate = 1;
let audioActive = false;

// Pre-rendered narration clips, keyed by trimmed text. When a job's text is
// registered here, the clip plays through the normal audio-element path
// instead of server TTS / speechSynthesis.
const prerecorded = new Map<string, string>();

export function registerPrerecorded(text: string, url: string) {
  prerecorded.set(text.trim(), url);
}

export function clearPrerecorded() {
  prerecorded.clear();
}

export function setSpeechRate(r: number) {
  rate = Math.min(2, Math.max(0.5, r));
}

// 0..1 through the current server-TTS clip, or null when unknown (speechSynthesis or idle).
export function speechProgress(): number | null {
  if (!audioActive) return null;
  const a = getAudioElement();
  return a.duration > 0 && Number.isFinite(a.duration) ? Math.min(1, a.currentTime / a.duration) : null;
}

export function pauseSpeaking() {
  if (audioActive) getAudioElement().pause();
  try {
    window.speechSynthesis?.pause();
  } catch {
    // ignore
  }
}

export function resumeSpeaking() {
  if (audioActive) void getAudioElement().play().catch(() => undefined);
  try {
    window.speechSynthesis?.resume();
  } catch {
    // ignore
  }
}

let queue: Job[] = [];
let pumping = false;
let cancelCurrent: (() => void) | null = null;
let ttsDisabled = false; // set after a 501 so we stop asking

export function speak(text: string, lang: Lang, opts?: SpeakOptions): Promise<void> {
  return new Promise((resolve) => {
    queue.push({ text, lang, opts, resolve });
    void pump();
  });
}

export function stopSpeaking() {
  const pending = queue;
  queue = [];
  pending.forEach((j) => j.resolve());
  cancelCurrent?.();
}

async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    while (queue.length) {
      const job = queue.shift()!;
      await playOne(job);
      job.resolve();
    }
  } finally {
    pumping = false;
  }
}

async function playOne(job: Job) {
  let cancelled = false;
  const ac = new AbortController();
  cancelCurrent = () => {
    cancelled = true;
    ac.abort();
    const a = getAudioElement();
    a.pause();
    a.dispatchEvent(new Event("rg-cancel"));
    window.speechSynthesis?.cancel();
  };
  try {
    // A pre-rendered clip wins over server TTS (which may be disabled with
    // 501). A failed fetch falls through to the behaviour below.
    const clip = prerecorded.get(job.text.trim());
    if (clip) {
      try {
        const res = await fetch(clip, { signal: ac.signal });
        if (res.ok) {
          const blob = await res.blob();
          if (cancelled) return;
          await playBlob(blob, () => cancelled, job.opts);
          return;
        }
      } catch {
        if (cancelled) return;
      }
    }
    if (!ttsDisabled) {
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: job.text, lang: job.lang }),
          signal: ac.signal,
        });
        if (res.status === 501) ttsDisabled = true;
        else if (res.ok) {
          const blob = await res.blob();
          if (cancelled) return;
          await playBlob(blob, () => cancelled, job.opts);
          return;
        }
      } catch {
        if (cancelled) return;
      }
    }
    if (!cancelled) await synth(job.text, job.lang, () => cancelled, job.opts);
  } finally {
    cancelCurrent = null;
  }
}

async function playBlob(blob: Blob, isCancelled: () => boolean, opts?: SpeakOptions) {
  const a = getAudioElement();
  const url = URL.createObjectURL(blob);
  try {
    for (;;) {
      a.defaultPlaybackRate = rate;
      a.src = url;
      a.playbackRate = rate;
      audioActive = true;
      let started = false;
      const onPlaying = () => {
        if (started) return;
        started = true;
        opts?.onStart?.(a.duration > 0 && Number.isFinite(a.duration) ? (a.duration * 1000) / rate : null);
      };
      a.addEventListener("playing", onPlaying);
      const blocked = await new Promise<boolean>((resolve) => {
        const done = (v: boolean) => {
          a.removeEventListener("ended", onEnd);
          a.removeEventListener("error", onEnd);
          a.removeEventListener("rg-cancel", onEnd);
          a.removeEventListener("playing", onPlaying);
          resolve(v);
        };
        const onEnd = () => done(false);
        a.addEventListener("ended", onEnd);
        a.addEventListener("error", onEnd);
        a.addEventListener("rg-cancel", onEnd);
        a.play().catch((err: unknown) => done(err instanceof DOMException && err.name === "NotAllowedError"));
      });
      if (!blocked || isCancelled()) return;
      await reportBlocked(); // wait for the "Tap to continue" overlay, then retry
    }
  } finally {
    audioActive = false;
    URL.revokeObjectURL(url);
  }
}

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  const synth = window.speechSynthesis;
  const now = synth.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const finish = () => resolve(synth.getVoices());
    synth.addEventListener("voiceschanged", finish, { once: true });
    setTimeout(finish, 1500);
  });
}

async function synth(text: string, lang: Lang, isCancelled: () => boolean, opts?: SpeakOptions) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const voices = await loadVoices();
  if (isCancelled()) return;
  const prefix = lang.toLowerCase();
  const voice =
    voices.find((v) => v.lang.toLowerCase().replace("_", "-") === prefix) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(prefix.split("-")[0]));
  await new Promise<void>((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = rate;
    if (voice) u.voice = voice;
    u.onstart = () => opts?.onStart?.(null);
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
}
