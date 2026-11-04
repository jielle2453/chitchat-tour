"use client";
// Background music and small feedback sounds, synthesised with Web Audio (no
// audio files, nothing to license). The music is a quiet generative
// music-box loop over soft pads; it ducks while the guide speaks. Nothing
// plays when the "sound" setting is off.
import { getAudioContext } from "./audio";

export type Sfx = "chime" | "pop" | "tick" | "arrive" | "tap";

let enabled = true;
let musicWanted = false;
let speaking = false;
let master: GainNode | null = null; // sound effects
let musicBus: GainNode | null = null; // music, ducked under speech
let echoIn: GainNode | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let nextAt = 0;
let step = 0;
let lastTick = 0;
let gestureHooked = false;

const MUSIC_LEVEL = 0.12;
const MUSIC_DUCKED = 0.028;

const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

function ready(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const ctx = getAudioContext();
  if (!ctx) return null;
  if (!gestureHooked) {
    gestureHooked = true;
    // resumes a context created outside a gesture, and starts waiting music
    window.addEventListener("pointerdown", () => {
      void ctx
        .resume()
        .then(() => {
          if (musicWanted && enabled) startLoop();
        })
        .catch(() => undefined);
    });
  }
  if (!master) {
    master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0;
    musicBus.connect(ctx.destination);
    // a soft echo gives the music box some room
    echoIn = ctx.createGain();
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.42;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 2400;
    echoIn.connect(delay);
    delay.connect(tone);
    tone.connect(fb);
    fb.connect(delay);
    tone.connect(wet);
    wet.connect(musicBus);
  }
  return ctx;
}

export function setSoundEnabled(on: boolean) {
  enabled = on;
  if (!on) stopLoop();
  else if (musicWanted) startLoop();
}

// ---------- feedback sounds ----------

function bell(ctx: AudioContext, out: AudioNode, at: number, midi: number, vol: number, decay: number) {
  const f = midiHz(midi);
  for (const [mult, v] of [
    [1, 1],
    [2.01, 0.28],
    [3.98, 0.08],
  ] as const) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = f * mult;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol * v, at + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay / Math.sqrt(mult));
    o.connect(g);
    g.connect(out);
    o.start(at);
    o.stop(at + decay + 0.05);
  }
}

function noiseBurst(ctx: AudioContext, out: AudioNode, at: number, dur: number, freq: number, vol: number) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = freq;
  bp.Q.value = 1.2;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(bp);
  bp.connect(g);
  g.connect(out);
  src.start(at);
}

// `strength` 0..1 scales the jar's collision ticks.
export function playSfx(kind: Sfx, strength = 1) {
  if (!enabled) return;
  const ctx = ready();
  if (!ctx || ctx.state !== "running" || !master) return;
  const out = master;
  const t = ctx.currentTime + 0.01;
  switch (kind) {
    case "chime": // a story was found
      bell(ctx, out, t, 81, 0.1, 1.4);
      bell(ctx, out, t + 0.11, 88, 0.08, 1.6);
      break;
    case "arrive": // reached the destination
      [72, 76, 79, 84].forEach((m, i) => bell(ctx, out, t + i * 0.12, m, 0.09, 1.8));
      break;
    case "pop": {
      // a sticker lands on the page
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(720, t);
      o.frequency.exponentialRampToValueAtTime(260, t + 0.09);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.11, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(g);
      g.connect(out);
      o.start(t);
      o.stop(t + 0.14);
      noiseBurst(ctx, out, t, 0.02, 3200, 0.05);
      break;
    }
    case "tick": {
      // stickers knocking in the jar: rate-limited, loudness follows impact
      const now = performance.now();
      if (now - lastTick < 45) return;
      lastTick = now;
      const s = Math.min(1, Math.max(0.15, strength));
      noiseBurst(ctx, out, t, 0.018, 1500 + s * 1400 + Math.random() * 400, 0.08 * s);
      break;
    }
    case "tap":
      noiseBurst(ctx, out, t, 0.01, 3600, 0.07);
      break;
  }
}

// ---------- background music ----------

// Fmaj7 – Am7 – Bbmaj7 – C6: warm and unresolved, so it loops without a seam.
const CHORDS = [
  { root: 41, pad: [57, 60, 64, 65], tones: [65, 69, 72, 76, 77, 81] },
  { root: 45, pad: [57, 60, 64, 67], tones: [64, 67, 69, 72, 76, 79] },
  { root: 46, pad: [57, 62, 65, 69], tones: [62, 65, 69, 70, 74, 77] },
  { root: 48, pad: [55, 60, 64, 69], tones: [64, 67, 69, 72, 76, 79] },
];
const BEAT = 60 / 66; // seconds
const BEATS_PER_CHORD = 4;

function pad(ctx: AudioContext, bus: AudioNode, at: number, dur: number, midis: number[], root: number) {
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 900;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(0.22, at + 1.4);
  g.gain.setValueAtTime(0.22, at + dur - 0.2);
  g.gain.linearRampToValueAtTime(0, at + dur + 1.2);
  lp.connect(g);
  g.connect(bus);
  for (const m of midis) {
    for (const det of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = midiHz(m);
      o.detune.value = det;
      const v = ctx.createGain();
      v.gain.value = 0.12;
      o.connect(v);
      v.connect(lp);
      o.start(at);
      o.stop(at + dur + 1.3);
    }
  }
  const b = ctx.createOscillator();
  b.type = "sine";
  b.frequency.value = midiHz(root);
  const bg = ctx.createGain();
  bg.gain.setValueAtTime(0, at);
  bg.gain.linearRampToValueAtTime(0.35, at + 0.6);
  bg.gain.linearRampToValueAtTime(0, at + dur + 0.8);
  b.connect(bg);
  bg.connect(bus);
  b.start(at);
  b.stop(at + dur + 0.9);
}

function pluck(ctx: AudioContext, bus: AudioNode, at: number, midi: number, vol: number) {
  const out = ctx.createGain();
  out.connect(bus);
  if (echoIn) out.connect(echoIn);
  bell(ctx, out, at, midi, vol, 1.6);
}

// Pseudo-random 0..1 per step: varied melody, same every loop of the app.
function rnd(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function schedule() {
  const ctx = ready();
  if (!ctx || !musicBus) return;
  const bus = musicBus;
  if (nextAt < ctx.currentTime) nextAt = ctx.currentTime + 0.1;
  while (nextAt < ctx.currentTime + 1.2) {
    const chord = CHORDS[Math.floor(step / BEATS_PER_CHORD) % CHORDS.length];
    if (step % BEATS_PER_CHORD === 0) pad(ctx, bus, nextAt, BEAT * BEATS_PER_CHORD, chord.pad, chord.root);
    const r = rnd(step);
    if (r < 0.55) pluck(ctx, bus, nextAt, chord.tones[Math.floor(r * 97) % chord.tones.length], 0.16 + r * 0.1);
    if (r > 0.82) pluck(ctx, bus, nextAt + BEAT / 2, chord.tones[Math.floor(r * 53) % chord.tones.length], 0.1);
    nextAt += BEAT;
    step++;
  }
}

function applyLevel(ctx: AudioContext) {
  if (!musicBus) return;
  const target = !enabled || !musicWanted ? 0 : speaking ? MUSIC_DUCKED : MUSIC_LEVEL;
  musicBus.gain.cancelScheduledValues(ctx.currentTime);
  musicBus.gain.setTargetAtTime(target, ctx.currentTime, speaking ? 0.15 : 0.6);
}

function startLoop() {
  const ctx = ready();
  if (!ctx || ctx.state !== "running") return;
  applyLevel(ctx);
  if (timer) return;
  schedule();
  timer = setInterval(schedule, 250);
}

function stopLoop() {
  const ctx = getAudioContext();
  if (ctx) applyLevel(ctx);
  // let the fade finish before the scheduler stops
  const t = timer;
  timer = null;
  if (t) setTimeout(() => clearInterval(t), 2500);
}

export function setMusicWanted(on: boolean) {
  if (musicWanted === on) return;
  musicWanted = on;
  if (on && enabled) startLoop();
  else stopLoop();
}

// Called by the speech queue: the music steps back while the guide talks.
export function setSpeaking(on: boolean) {
  if (speaking === on) return;
  speaking = on;
  const ctx = getAudioContext();
  if (ctx) applyLevel(ctx);
}
