// Renders the app's Web Audio music and sfx (ported from src/lib/client/sound.ts)
// offline in headless Chrome, then writes normalized 16-bit WAVs.
// usage (Git Bash, from repo root): MSYS_NO_PATHCONV=1 node video/scripts/render-audio.mjs
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");
const outDir = join(repo, "video", "public", "audio");
mkdirSync(outDir, { recursive: true });

const SR = 48000;
const TARGET_DB = -3;
const jobs = [
  { name: "music", seconds: 200 },
  { name: "chime", seconds: 2.0 },
  { name: "arrive", seconds: 2.5 },
  { name: "pop", seconds: 0.3 },
  { name: "tick", seconds: 0.15 },
  { name: "tap", seconds: 0.12 },
];

// ---- runs in the page ----
function pageSynth() {
  // deterministic Math.random for the noise bursts
  let seed = 0x5eed1234;
  Math.random = () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const MUSIC_LEVEL = 0.12;
  const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

  function bell(ctx, out, at, midi, vol, decay) {
    const f = midiHz(midi);
    for (const [mult, v] of [[1, 1], [2.01, 0.28], [3.98, 0.08]]) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f * mult;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(vol * v, at + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, at + decay / Math.sqrt(mult));
      o.connect(g); g.connect(out);
      o.start(at); o.stop(at + decay + 0.05);
    }
  }

  function noiseBurst(ctx, out, at, dur, freq, vol) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = freq; bp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(bp); bp.connect(g); g.connect(out);
    src.start(at);
  }

  function sfx(ctx, out, kind, t, strength = 1) {
    switch (kind) {
      case "chime":
        bell(ctx, out, t, 81, 0.1, 1.4);
        bell(ctx, out, t + 0.11, 88, 0.08, 1.6);
        break;
      case "arrive":
        [72, 76, 79, 84].forEach((m, i) => bell(ctx, out, t + i * 0.12, m, 0.09, 1.8));
        break;
      case "pop": {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.setValueAtTime(720, t);
        o.frequency.exponentialRampToValueAtTime(260, t + 0.09);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.11, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
        o.connect(g); g.connect(out);
        o.start(t); o.stop(t + 0.14);
        noiseBurst(ctx, out, t, 0.02, 3200, 0.05);
        break;
      }
      case "tick": {
        const s = Math.min(1, Math.max(0.15, strength));
        noiseBurst(ctx, out, t, 0.018, 1500 + s * 1400 + Math.random() * 400, 0.08 * s);
        break;
      }
      case "tap":
        noiseBurst(ctx, out, t, 0.01, 3600, 0.07);
        break;
    }
  }

  const CHORDS = [
    { root: 41, pad: [57, 60, 64, 65], tones: [65, 69, 72, 76, 77, 81] },
    { root: 45, pad: [57, 60, 64, 67], tones: [64, 67, 69, 72, 76, 79] },
    { root: 46, pad: [57, 62, 65, 69], tones: [62, 65, 69, 70, 74, 77] },
    { root: 48, pad: [55, 60, 64, 69], tones: [64, 67, 69, 72, 76, 79] },
  ];
  const BEAT = 60 / 66;
  const BEATS_PER_CHORD = 4;

  function pad(ctx, bus, at, dur, midis, root) {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.22, at + 1.4);
    g.gain.setValueAtTime(0.22, at + dur - 0.2);
    g.gain.linearRampToValueAtTime(0, at + dur + 1.2);
    lp.connect(g); g.connect(bus);
    for (const m of midis) {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = "triangle";
        o.frequency.value = midiHz(m);
        o.detune.value = det;
        const v = ctx.createGain();
        v.gain.value = 0.12;
        o.connect(v); v.connect(lp);
        o.start(at); o.stop(at + dur + 1.3);
      }
    }
    const b = ctx.createOscillator();
    b.type = "sine";
    b.frequency.value = midiHz(root);
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0, at);
    bg.gain.linearRampToValueAtTime(0.35, at + 0.6);
    bg.gain.linearRampToValueAtTime(0, at + dur + 0.8);
    b.connect(bg); bg.connect(bus);
    b.start(at); b.stop(at + dur + 0.9);
  }

  function rnd(n) {
    const x = Math.sin(n * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  }

  function music(ctx, seconds, start) {
    const musicBus = ctx.createGain();
    musicBus.gain.value = MUSIC_LEVEL; // un-ducked, no fade-in
    musicBus.connect(ctx.destination);
    const echoIn = ctx.createGain();
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.42;
    const fb = ctx.createGain(); fb.gain.value = 0.32;
    const wet = ctx.createGain(); wet.gain.value = 0.35;
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass"; tone.frequency.value = 2400;
    echoIn.connect(delay); delay.connect(tone); tone.connect(fb); fb.connect(delay);
    tone.connect(wet); wet.connect(musicBus);

    const pluck = (at, midi, vol) => {
      const out = ctx.createGain();
      out.connect(musicBus); out.connect(echoIn);
      bell(ctx, out, at, midi, vol, 1.6);
    };
    const notes = [];
    let nextAt = start, step = 0;
    while (nextAt < seconds) {
      const chord = CHORDS[Math.floor(step / BEATS_PER_CHORD) % CHORDS.length];
      if (step % BEATS_PER_CHORD === 0) pad(ctx, musicBus, nextAt, BEAT * BEATS_PER_CHORD, chord.pad, chord.root);
      const r = rnd(step);
      if (r < 0.55) { const m = chord.tones[Math.floor(r * 97) % chord.tones.length]; pluck(nextAt, m, 0.16 + r * 0.1); notes.push([+nextAt.toFixed(4), m, step]); }
      if (r > 0.82) { const m = chord.tones[Math.floor(r * 53) % chord.tones.length]; pluck(nextAt + BEAT / 2, m, 0.1); notes.push([+(nextAt + BEAT / 2).toFixed(4), m, step + 0.5]); }
      nextAt += BEAT;
      step++;
    }
    return notes;
  }

  window.__render = async (name, seconds, sr) => {
    const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: Math.ceil(seconds * sr), sampleRate: sr });
    let notes = null;
    if (name === "music") notes = music(ctx, seconds, 0);
    else {
      const master = ctx.createGain();
      master.gain.value = 1;
      master.connect(ctx.destination);
      sfx(ctx, master, name, 0.01);
    }
    const buf = await ctx.startRendering();
    window.__buf = [buf.getChannelData(0), buf.getChannelData(1)];
    return { length: buf.length, notes };
  };
  window.__chunk = (ch, from, n) => {
    const a = window.__buf[ch].subarray(from, from + n);
    const u8 = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    let s = "";
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  };
  return "ok";
}

// ---- CDP plumbing ----
const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const profile = join(repo, ".claude/probe/chrome-profile-audio");
const port = 9355;
const proc = spawn(chrome, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--autoplay-policy=no-user-gesture-required", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, browserWs;
for (let i = 0; i < 80; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    const page = list.find((t) => t.type === "page");
    const ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); browserWs = ver.webSocketDebuggerUrl; break; }
  } catch {}
  await sleep(250);
}
await new Promise((r) => ws.addEventListener("open", r));
let id = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
};

function wav16(L, R, sr) {
  const n = L.length, data = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767))), i * 4);
    data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767))), i * 4 + 2);
  }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

try {
  await send("Runtime.enable");
  console.log(await evalJs(`(${pageSynth.toString()})()`));
  const target = 10 ** (TARGET_DB / 20);
  for (const job of jobs) {
    const { length, notes } = await evalJs(`window.__render(${JSON.stringify(job.name)}, ${job.seconds}, ${SR})`);
    const chans = [];
    const CH = SR * 10;
    for (let c = 0; c < 2; c++) {
      const out = new Float32Array(length);
      for (let from = 0; from < length; from += CH) {
        const b64 = await evalJs(`window.__chunk(${c}, ${from}, ${CH})`);
        const b = Buffer.from(b64, "base64");
        out.set(new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4), from);
      }
      chans.push(out);
    }
    let peak = 0;
    for (const ch of chans) for (const v of ch) peak = Math.max(peak, Math.abs(v));
    const gain = peak > 0 ? target / peak : 1;
    for (const ch of chans) for (let i = 0; i < ch.length; i++) ch[i] *= gain;
    writeFileSync(join(outDir, `${job.name}.wav`), wav16(chans[0], chans[1], SR));
    console.log(`${job.name}: ${(length / SR).toFixed(3)}s rawPeak=${(20 * Math.log10(peak)).toFixed(2)}dBFS gain=x${gain.toFixed(2)}`);
    if (notes) writeFileSync(join(here, "music-notes.json"), JSON.stringify(notes));
  }
} finally {
  try {
    const b = new WebSocket(browserWs);
    await new Promise((r) => b.addEventListener("open", r));
    b.send(JSON.stringify({ id: 1, method: "Browser.close" }));
    await sleep(1000);
  } catch {}
  try { proc.kill(); } catch {}
}
process.exit(0);
