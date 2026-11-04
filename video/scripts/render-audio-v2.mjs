// Promo v2: the app's music-box melody + pad at 100 BPM, a separate drum/bass stem
// on the same grid, and transition one-shots. Rendered offline in headless Chrome.
// usage (Git Bash, from repo root): MSYS_NO_PATHCONV=1 node video/scripts/render-audio-v2.mjs
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
  { name: "v2_melody", seconds: 200 },
  { name: "v2_drums", seconds: 200 },
  { name: "whoosh", seconds: 0.7 },
  { name: "hit", seconds: 1.2 },
  { name: "riser", seconds: 2.4 },
  { name: "tick", seconds: 0.08 },
  { name: "swoosh_soft", seconds: 0.4 },
];

function pageSynth() {
  let seed = 0x5eed2222;
  const rand = () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);
  const BEAT = 60 / 100;
  const BAR = BEAT * 4;
  const CHORDS = [
    { root: 41, pad: [57, 60, 64, 65], tones: [65, 69, 72, 76, 77, 81] },
    { root: 45, pad: [57, 60, 64, 67], tones: [64, 67, 69, 72, 76, 79] },
    { root: 46, pad: [57, 62, 65, 69], tones: [62, 65, 69, 70, 74, 77] },
    { root: 48, pad: [55, 60, 64, 69], tones: [64, 67, 69, 72, 76, 79] },
  ];
  const rnd = (n) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };

  let noiseBuf = null;
  const noise = (ctx) => {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = rand() * 2 - 1;
    }
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    return s;
  };
  const panner = (ctx, out, p) => { const n = ctx.createStereoPanner(); n.pan.value = p; n.connect(out); return n; };

  // same bell as the app
  function bell(ctx, out, at, midi, vol, decay) {
    const f = midiHz(midi);
    for (const [mult, v] of [[1, 1], [2.01, 0.28], [3.98, 0.08]]) {
      const o = ctx.createOscillator();
      o.type = "sine"; o.frequency.value = f * mult;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(vol * v, at + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, at + decay / Math.sqrt(mult));
      o.connect(g); g.connect(out);
      o.start(at); o.stop(at + decay + 0.05);
    }
  }

  function melody(ctx, seconds) {
    const bus = ctx.createGain();
    bus.gain.value = 0.12;
    bus.connect(ctx.destination);
    // echo, synced to a dotted 8th and a touch brighter than the app's
    const echoIn = ctx.createGain();
    const delay = ctx.createDelay(1); delay.delayTime.value = BEAT * 0.75;
    const fb = ctx.createGain(); fb.gain.value = 0.3;
    const wet = ctx.createGain(); wet.gain.value = 0.32;
    const tone = ctx.createBiquadFilter(); tone.type = "lowpass"; tone.frequency.value = 3200;
    echoIn.connect(delay); delay.connect(tone); tone.connect(fb); fb.connect(delay);
    tone.connect(wet); wet.connect(panner(ctx, bus, 0.3));

    const pad = (at, dur, midis, root) => {
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1300;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.22, at + 0.9);
      g.gain.setValueAtTime(0.22, at + dur - 0.2);
      g.gain.linearRampToValueAtTime(0, at + dur + 1.0);
      lp.connect(g); g.connect(bus);
      for (const m of midis) for (const det of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = "triangle"; o.frequency.value = midiHz(m); o.detune.value = det;
        const v = ctx.createGain(); v.gain.value = 0.12;
        o.connect(v); v.connect(panner(ctx, lp, 0)); // mono pad as in the app
        o.start(at); o.stop(at + dur + 1.1);
      }
      const b = ctx.createOscillator(); b.type = "sine"; b.frequency.value = midiHz(root);
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(0, at);
      bg.gain.linearRampToValueAtTime(0.35, at + 0.4);
      bg.gain.linearRampToValueAtTime(0, at + dur + 0.6);
      b.connect(bg); bg.connect(bus);
      b.start(at); b.stop(at + dur + 0.7);
    };
    const pluck = (at, midi, vol) => {
      const out = ctx.createGain(); out.gain.value = 1.15;
      out.connect(bus); out.connect(echoIn);
      bell(ctx, out, at, midi, vol, 1.6);
    };
    const notes = [];
    for (let step = 0, at = 0; at < seconds; step++, at = step * BEAT) {
      const chord = CHORDS[Math.floor(step / 4) % 4];
      if (step % 4 === 0) pad(at, BAR, chord.pad, chord.root);
      const r = rnd(step);
      if (r < 0.55) { const m = chord.tones[Math.floor(r * 97) % 6]; pluck(at, m, 0.16 + r * 0.1); notes.push([+at.toFixed(3), m]); }
      if (r > 0.82) { const m = chord.tones[Math.floor(r * 53) % 6]; pluck(at + BEAT / 2, m, 0.1); notes.push([+(at + BEAT / 2).toFixed(3), m]); }
    }
    return notes;
  }

  function drums(ctx, seconds) {
    // no DynamicsCompressor: its 6 ms lookahead would push the stem off the grid
    const bus = ctx.createGain(); bus.gain.value = 0.5;
    bus.connect(ctx.destination);
    const hum = (v, amt) => v * (1 - amt + rand() * amt);

    const kick = (at, vol) => {
      const o = ctx.createOscillator(); o.type = "sine";
      o.frequency.setValueAtTime(120, at);
      o.frequency.exponentialRampToValueAtTime(48, at + 0.11);
      o.frequency.exponentialRampToValueAtTime(42, at + 0.4);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(vol, at + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0008, at + 0.42);
      o.connect(g); g.connect(bus);
      o.start(at); o.stop(at + 0.45);
      // soft beater click
      const n = noise(ctx);
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1800;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(vol * 0.12, at);
      ng.gain.exponentialRampToValueAtTime(0.0001, at + 0.012);
      n.connect(lp); lp.connect(ng); ng.connect(bus);
      n.start(at, rand() * 3, 0.02);
    };
    const clap = (at, vol) => {
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1700; bp.Q.value = 1.1;
      const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 600;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at);
      // three quick flams then a short room tail
      [0, 0.011, 0.022].forEach((dt, i) => {
        g.gain.setValueAtTime(vol * (i === 2 ? 1 : 0.7), at + dt);
        g.gain.exponentialRampToValueAtTime(vol * 0.12, at + dt + 0.009);
      });
      g.gain.setValueAtTime(vol * 0.55, at + 0.031);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
      const n = noise(ctx);
      n.connect(hp); hp.connect(bp); bp.connect(g); g.connect(panner(ctx, bus, -0.08));
      n.start(at, rand() * 3, 0.25);
    };
    const shaker = (at, vol, open) => {
      const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 6500;
      const pk = ctx.createBiquadFilter(); pk.type = "peaking"; pk.frequency.value = 9500; pk.gain.value = 4;
      const g = ctx.createGain();
      const len = open ? 0.18 : 0.045;
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(vol, at + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, at + len);
      const n = noise(ctx);
      n.connect(hp); hp.connect(pk); pk.connect(g); g.connect(panner(ctx, bus, 0.28));
      n.start(at, rand() * 3, len + 0.02);
    };
    const bass = (at, midi, dur, vol) => {
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 380; lp.Q.value = 0.7;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(vol, at + 0.008);
      g.gain.exponentialRampToValueAtTime(vol * 0.45, at + dur * 0.6);
      g.gain.linearRampToValueAtTime(0, at + dur);
      lp.connect(g); g.connect(bus);
      const s = ctx.createOscillator(); s.type = "sine"; s.frequency.value = midiHz(midi);
      const t = ctx.createOscillator(); t.type = "triangle"; t.frequency.value = midiHz(midi + 12);
      const tg = ctx.createGain(); tg.gain.value = 0.35;
      s.connect(lp); t.connect(tg); tg.connect(lp);
      s.start(at); t.start(at); s.stop(at + dur + 0.02); t.stop(at + dur + 0.02);
    };

    const EIGHTH = BEAT / 2;
    const SWING = 0.57; // offbeat 8th lands at 57% of the beat
    const off = (beatAt) => beatAt + BEAT * SWING;
    const bars = Math.ceil(seconds / BAR);
    for (let bar = 0; bar < bars; bar++) {
      const t0 = bar * BAR;
      const chord = CHORDS[bar % 4], next = CHORDS[(bar + 1) % 4];
      for (let b = 0; b < 4; b++) {
        const at = t0 + b * BEAT;
        if (b === 0 || b === 2) kick(at, hum(b === 0 ? 0.95 : 0.8, 0.08));
        if (b === 1 || b === 3) clap(at, hum(0.32, 0.12));
        shaker(at, hum(0.16, 0.25), false);
        const lastOff = b === 3 && bar % 4 === 3;
        shaker(off(at), hum(0.1, 0.25), lastOff);
      }
      // bass: root on the downbeat, swung 8th pickup into the next chord's root
      bass(t0, chord.root - 12, BEAT * 2.6, 0.55);
      bass(t0 + BEAT * 2, chord.root - 12, BEAT * 1.2, 0.3);
      bass(off(t0 + BEAT * 3), next.root - 12, EIGHTH * 0.85, 0.42);
    }
    return null;
  }

  function sfx(ctx, name, len) {
    const out = ctx.createGain(); out.connect(ctx.destination);
    if (name === "whoosh") {
      const n = noise(ctx);
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 1.6;
      bp.frequency.setValueAtTime(300, 0);
      bp.frequency.exponentialRampToValueAtTime(4200, 0.3);
      bp.frequency.exponentialRampToValueAtTime(350, 0.6);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, 0);
      g.gain.exponentialRampToValueAtTime(1, 0.28);
      g.gain.exponentialRampToValueAtTime(0.0001, 0.6);
      const p = ctx.createStereoPanner();
      p.pan.setValueAtTime(-0.6, 0); p.pan.linearRampToValueAtTime(0.6, 0.6);
      n.connect(bp); bp.connect(g); g.connect(p); p.connect(out);
      n.start(0, 0, 0.62);
    } else if (name === "swoosh_soft") {
      const n = noise(ctx);
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 0.5;
      lp.frequency.setValueAtTime(700, 0);
      lp.frequency.exponentialRampToValueAtTime(2600, 0.16);
      lp.frequency.exponentialRampToValueAtTime(800, 0.35);
      const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 250;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, 0);
      g.gain.exponentialRampToValueAtTime(1, 0.14);
      g.gain.exponentialRampToValueAtTime(0.0001, 0.35);
      const p = ctx.createStereoPanner();
      p.pan.setValueAtTime(-0.25, 0); p.pan.linearRampToValueAtTime(0.25, 0.35);
      n.connect(hp); hp.connect(lp); lp.connect(g); g.connect(p); p.connect(out);
      n.start(0, 1, 0.37);
    } else if (name === "hit") {
      const o = ctx.createOscillator(); o.type = "sine";
      o.frequency.setValueAtTime(60, 0);
      o.frequency.exponentialRampToValueAtTime(40, 0.8);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, 0);
      g.gain.linearRampToValueAtTime(1, 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, 1.15);
      o.connect(g); g.connect(out);
      o.start(0); o.stop(1.2);
      const o2 = ctx.createOscillator(); o2.type = "sine"; // body thump
      o2.frequency.setValueAtTime(160, 0); o2.frequency.exponentialRampToValueAtTime(60, 0.06);
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.6, 0); g2.gain.exponentialRampToValueAtTime(0.0001, 0.12);
      o2.connect(g2); g2.connect(out); o2.start(0); o2.stop(0.15);
      const n = noise(ctx);
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3500;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.5, 0); ng.gain.exponentialRampToValueAtTime(0.0001, 0.07);
      n.connect(lp); lp.connect(ng); ng.connect(out); n.start(0, 2, 0.08);
      const bells = ctx.createGain(); bells.gain.value = 1; bells.connect(out);
      bell(ctx, bells, 0.005, 77, 0.3, 1.1); // F5
      bell(ctx, bells, 0.005, 89, 0.22, 1.1); // F6
    } else if (name === "riser") {
      const n = noise(ctx);
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 2;
      bp.frequency.setValueAtTime(250, 0); bp.frequency.exponentialRampToValueAtTime(9000, 2.4);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.02, 0); ng.gain.exponentialRampToValueAtTime(0.9, 2.38);
      n.connect(bp); bp.connect(ng); ng.connect(out); n.start(0, 0, 2.4);
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass";
      lp.frequency.setValueAtTime(600, 0); lp.frequency.exponentialRampToValueAtTime(5000, 2.4);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.01, 0); og.gain.exponentialRampToValueAtTime(0.35, 2.38);
      lp.connect(og); og.connect(out);
      for (const det of [-9, 9]) {
        const o = ctx.createOscillator(); o.type = "sawtooth"; o.detune.value = det;
        o.frequency.setValueAtTime(midiHz(53), 0); // F3 -> F5, lands on the tonic
        o.frequency.exponentialRampToValueAtTime(midiHz(77), 2.4);
        o.connect(lp); o.start(0); o.stop(2.4);
      }
      out.gain.setValueAtTime(1, 2.397); out.gain.linearRampToValueAtTime(0, 2.4); // abrupt, click-free
    } else if (name === "tick") {
      const n = noise(ctx);
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 4200; bp.Q.value = 3;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(1, 0.002); ng.gain.exponentialRampToValueAtTime(0.0001, 0.012);
      n.connect(bp); bp.connect(ng); ng.connect(out); n.start(0.002, 3, 0.02);
      for (const [f, v, d] of [[2900, 0.35, 0.025], [1250, 0.3, 0.045]]) {
        const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, 0.002); g.gain.linearRampToValueAtTime(v, 0.0028);
        g.gain.exponentialRampToValueAtTime(0.0001, 0.002 + d);
        o.connect(g); g.connect(out); o.start(0.002); o.stop(0.06);
      }
    }
    return null;
  }

  window.__render = async (name, seconds, sr) => {
    const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: Math.round(seconds * sr), sampleRate: sr });
    noiseBuf = null;
    const notes = name === "v2_melody" ? melody(ctx, seconds) : name === "v2_drums" ? drums(ctx, seconds) : sfx(ctx, name, seconds);
    const buf = await ctx.startRendering();
    window.__buf = [buf.getChannelData(0), buf.getChannelData(1)];
    // first non-silent sample, for the downbeat check
    let first = -1;
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > 1e-5) { first = i; break; }
    return { length: buf.length, notes, first };
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

const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const profile = join(repo, ".claude/probe/chrome-profile-audio");
const port = 9355;
const proc = spawn(chrome, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
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

const only = process.argv.slice(2);
try {
  await send("Runtime.enable");
  console.log(await evalJs(`(${pageSynth.toString()})()`));
  const target = 10 ** (TARGET_DB / 20);
  for (const job of jobs) {
    if (only.length && !only.includes(job.name)) continue;
    const { length, notes, first } = await evalJs(`window.__render(${JSON.stringify(job.name)}, ${job.seconds}, ${SR})`);
    const chans = [];
    const CH = SR * 10;
    for (let c = 0; c < 2; c++) {
      const out = new Float32Array(length);
      for (let from = 0; from < length; from += CH) {
        const b = Buffer.from(await evalJs(`window.__chunk(${c}, ${from}, ${CH})`), "base64");
        out.set(new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4), from);
      }
      chans.push(out);
    }
    let peak = 0, ss = 0;
    for (const ch of chans) for (const v of ch) { peak = Math.max(peak, Math.abs(v)); ss += v * v; }
    const gain = peak > 0 ? target / peak : 1;
    for (const ch of chans) for (let i = 0; i < ch.length; i++) ch[i] *= gain;
    writeFileSync(join(outDir, `${job.name}.wav`), wav16(chans[0], chans[1], SR));
    const rms = 10 * Math.log10((ss * gain * gain) / (2 * length));
    console.log(`${job.name}: ${(length / SR).toFixed(3)}s rawPeak=${(20 * Math.log10(peak)).toFixed(2)}dBFS gain=x${gain.toFixed(2)} rms=${rms.toFixed(1)} firstSample=${first}`);
    if (notes) writeFileSync(join(here, "v2-melody-notes.json"), JSON.stringify(notes));
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
