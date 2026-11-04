import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Phone } from "../components/Phone";
import { ease, Rise } from "../components/ui";
import { BAR, BEAT, C, FONT } from "../theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// ---------- collage wordmark (the app's own cut-out letters) ----------
const LINE1 = [
  ["letter-c1", -8, 3],
  ["letter-h1", 6, -4],
  ["letter-i", -5, 4],
  ["letter-t1", 8, -3],
  ["letter-c2", -7, 4],
  ["letter-h2", 5, -4],
  ["letter-a", -6, 3],
  ["letter-t2", 7, -2],
] as const;
const LINE2 = [
  ["letter-t3", 6, 0],
  ["letter-o", -7, -3],
  ["letter-u", 5, 3],
  ["letter-r", -6, -2],
] as const;

export const Wordmark: React.FC<{ size?: number; delay?: number; step?: number }> = ({ size = 120, delay = 0, step = 2.4 }) => {
  const f = useCurrentFrame();
  const row = (letters: readonly (readonly [string, number, number])[], offset: number) => (
    <div style={{ display: "flex", justifyContent: "center", gap: size * -0.04 }}>
      {letters.map(([name, rot, y], i) => {
        const t = f - delay - (offset + i) * step;
        const k = interpolate(t, [0, 4, 7, 10], [1.6, 0.92, 1.04, 1], clamp);
        const o = interpolate(t, [0, 2], [0, 1], clamp);
        return (
          <Img
            key={name}
            src={staticFile(`letters/${name}.webp`)}
            style={{ width: size, height: size, objectFit: "contain", transform: `translateY(${(y * size) / 48}px) rotate(${rot}deg) scale(${k})`, opacity: o, filter: "drop-shadow(0 6px 10px rgba(0,0,0,0.25))" }}
          />
        );
      })}
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: size * 0.02, alignItems: "center" }}>
      {row(LINE1, 0)}
      {row(LINE2, LINE1.length)}
    </div>
  );
};

// ---------- first-person hook: looking around, questions piling up ----------
type Q = { x: number; y: number; at: number; text?: string };
type Shot = { src: string; from: number; dur: number; move: "push" | "tiltUp" | "panLeft" | "panRight"; qs: Q[] };

const SHOTS: Shot[] = [
  { src: "pov/rooftops.webp", from: 0, dur: 96, move: "tiltUp", qs: [{ x: 0.2, y: 0.22, at: 26, text: "Why a tank on every roof?" }, { x: 0.62, y: 0.4, at: 50 }] },
  { src: "pov/postbox.webp", from: 96, dur: 96, move: "panLeft", qs: [{ x: 0.3, y: 0.5, at: 16, text: "Why red and green?" }, { x: 0.1, y: 0.32, at: 40 }] },
  { src: "pov/crossing.webp", from: 192, dur: 96, move: "push", qs: [{ x: 0.5, y: 0.66, at: 14, text: "A box just for scooters?" }, { x: 0.86, y: 0.2, at: 36 }, { x: 0.15, y: 0.3, at: 52 }] },
];

const Bubble: React.FC<{ q: Q; local: number }> = ({ q, local }) => {
  const t = local - q.at;
  if (t < 0) return null;
  const k = interpolate(t, [0, 5, 8, 11], [0, 1.2, 0.94, 1], clamp);
  const bob = Math.sin(t / 7) * 4;
  return (
    <div style={{ position: "absolute", left: `${q.x * 100}%`, top: `${q.y * 100}%`, transform: `translate(-50%, -50%) translateY(${bob}px) scale(${k})`, display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 74, height: 74, borderRadius: 99, background: C.white, color: C.ink, fontSize: 48, fontWeight: 800, display: "grid", placeItems: "center", boxShadow: "0 12px 30px rgba(0,0,0,0.35)" }}>?</div>
      {q.text && (
        <div style={{ background: "rgba(17,17,17,0.82)", color: C.white, padding: "12px 20px", borderRadius: 16, fontSize: 28, fontWeight: 600, whiteSpace: "nowrap", opacity: interpolate(t, [4, 10], [0, 1], clamp) }}>{q.text}</div>
      )}
    </div>
  );
};

export const PovHook: React.FC = () => {
  const f = useCurrentFrame();
  const textAt = 288;
  return (
    <AbsoluteFill style={{ background: C.night, fontFamily: FONT, color: C.white, overflow: "hidden" }}>
      {SHOTS.map((sh, i) => {
        const local = f - sh.from;
        if (local < -8 || local > sh.dur + 8) return null;
        const t = Math.max(0, Math.min(1, local / sh.dur));
        // whip between shots: a quick sideways slide with blur, like turning your head
        const inT = interpolate(local, [-8, 0], [1, 0], clamp);
        const outT = interpolate(local, [sh.dur - 2, sh.dur + 8], [0, 1], clamp);
        const whip = (i % 2 ? -1 : 1) * (inT * 60 - outT * 60);
        const blur = (inT + outT) * 14;
        const bob = Math.sin(local / 9) * 6;
        let tf = "";
        if (sh.move === "push") tf = `scale(${1.08 + 0.12 * t}) translateY(${bob}px)`;
        if (sh.move === "tiltUp") tf = `scale(1.22) translateY(${interpolate(t, [0, 1], [7, -6])}%)`;
        if (sh.move === "panLeft") tf = `scale(1.2) translateX(${interpolate(t, [0, 1], [6, -5])}%) translateY(${bob * 0.6}px)`;
        if (sh.move === "panRight") tf = `scale(1.2) translateX(${interpolate(t, [0, 1], [-6, 5])}%)`;
        return (
          <AbsoluteFill key={sh.src} style={{ transform: `translateX(${whip}%)`, filter: `blur(${blur}px)` }}>
            <AbsoluteFill style={{ transform: tf }}>
              <Img src={staticFile(sh.src)} style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.92) contrast(1.05) saturate(0.9)" }} />
            </AbsoluteFill>
            <AbsoluteFill>{sh.qs.map((q, j) => <Bubble key={j} q={q} local={local} />)}</AbsoluteFill>
          </AbsoluteFill>
        );
      })}
      {f < textAt && <div style={{ position: "absolute", right: 30, bottom: 22, fontSize: 18, color: "rgba(255,255,255,0.7)" }}>Street photos generated with Muse Image</div>}
      {f < textAt && f > 40 && (
        <div style={{ position: "absolute", left: 110, bottom: 90, fontSize: 56, fontWeight: 800, letterSpacing: -1.5, textShadow: "0 4px 24px rgba(0,0,0,0.5)", opacity: interpolate(f, [40, 50], [0, 1], clamp) }}>
          So many little things.
        </div>
      )}
      {f >= textAt && (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center", background: C.night }}>
          <Rise text="You don't even know what to ask." size={92} weight={800} color={C.subDark} delay={textAt} stagger={2} />
          <Rise text="It tells you — before you ask." size={92} weight={800} color={C.white} delay={textAt + BEAT * 2} stagger={2} />
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

// ---------- how the guide decides, read off the real trace ----------
// Rows in the 1864-px-tall trace screenshot.
const SRC_H = 1864;
const STEPS = [
  { at: 10, title: "Looks around", body: "OpenStreetMap places within a few steps.", y0: 1636, y1: 1694 },
  { at: 70, title: "Scores what's new to you", body: "“same as in JP” scores low. “different from JP” scores high.", y0: 834, y1: 1612 },
  { at: 170, title: "Muse Spark chooses", body: "The model picks one story — or none.", y0: 762, y1: 812 },
  { at: 230, title: "Tells you, with sources", body: "Only from the verified knowledge base or whitelisted sites.", y0: 606, y1: 738 },
];

export const Decide: React.FC = () => {
  const f = useCurrentFrame();
  const enter = interpolate(f, [0, 14], [0, 1], { ...clamp, easing: ease });
  const cur = [...STEPS].reverse().find((s) => f >= s.at) ?? STEPS[0];
  const phoneH = 900;
  const phoneW = (phoneH * 430) / 932;
  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: FONT, color: C.ink }}>
      <div style={{ position: "absolute", left: 230, top: 74, transform: `translateX(${(1 - enter) * -700}px)` }}>
        <Phone src="captures/trace.png" height={phoneH}>
          {STEPS.map((s) => {
            const on = s === cur;
            const k = interpolate(f - s.at, [0, 8], [0, 1], clamp);
            return (
              <div
                key={s.title}
                style={{
                  position: "absolute",
                  left: 10,
                  right: 10,
                  top: (s.y0 / SRC_H) * phoneH - 4,
                  height: ((s.y1 - s.y0) / SRC_H) * phoneH + 8,
                  borderRadius: 14,
                  border: `3px solid ${C.ink}`,
                  background: "rgba(242,240,237,0.25)",
                  opacity: on ? k : 0,
                  transform: `scale(${0.96 + 0.04 * k})`,
                }}
              />
            );
          })}
        </Phone>
      </div>
      <div style={{ position: "absolute", left: 230 + phoneW + 130, top: 150, width: 820, display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 5, color: C.sub }}>WHAT THE GUIDE IS THINKING</div>
        <Rise text="How it decides what to say." size={64} weight={800} delay={2} />
        <div style={{ display: "flex", flexDirection: "column", gap: 0, marginTop: 24 }}>
          {STEPS.map((s, i) => {
            const p = interpolate(f - s.at, [0, 10], [0, 1], { ...clamp, easing: ease });
            const on = s === cur;
            return (
              <div key={s.title} style={{ display: "flex", gap: 24, padding: "20px 0", borderTop: `1px solid ${C.line}`, opacity: p * (on ? 1 : 0.45), transform: `translateX(${(1 - p) * 30}px)` }}>
                <div style={{ width: 44, height: 44, borderRadius: 99, background: on ? C.ink : C.white, color: on ? C.white : C.ink, border: `2px solid ${C.ink}`, display: "grid", placeItems: "center", fontSize: 22, fontWeight: 800, flexShrink: 0 }}>{i + 1}</div>
                <div>
                  <div style={{ fontSize: 36, fontWeight: 800 }}>{s.title}</div>
                  {on && <div style={{ fontSize: 26, color: C.sub, marginTop: 6 }}>{s.body}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---------- what was built ----------
const STATS = [
  { n: 51, label: "hand-checked stories, each with sources" },
  { n: 32, label: "story stickers made with Muse Image" },
  { n: 6, label: "Meta models working together" },
  { n: 381, label: "automated tests" },
];

export const Built: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.night, fontFamily: FONT, color: C.white, padding: "130px 170px", gap: 60 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 5, color: C.subDark }}>BUILT DURING THE HACKATHON</div>
        <Rise text="Everything you just saw is real and running." size={60} weight={800} color={C.white} delay={2} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "40px 80px" }}>
        {STATS.map((s, i) => {
          const at = 16 + i * 8;
          const t = interpolate(f - at, [0, 18], [0, 1], { ...clamp, easing: ease });
          return (
            <div key={s.label} style={{ display: "flex", alignItems: "baseline", gap: 26, opacity: Math.min(1, t * 3), borderTop: "1px solid #3A3733", paddingTop: 22 }}>
              <div style={{ fontSize: 110, fontWeight: 800, letterSpacing: -4, width: 260, fontVariantNumeric: "tabular-nums" }}>{Math.round(s.n * t)}</div>
              <div style={{ fontSize: 30, color: C.subDark, lineHeight: 1.3 }}>{s.label}</div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 24, color: C.subDark, opacity: interpolate(f, [70, 84], [0, 1], clamp) }}>Live at chitchat-tour.vercel.app · open source on GitHub</div>
    </AbsoluteFill>
  );
};

// ---------- business model ----------
const MARKET = [
  { n: "1.52B", label: "international tourist trips", src: "UN Tourism, 2025" },
  { n: "8.57M", label: "visitors to Taiwan", src: "Tourism Administration, 2025" },
  { n: "65%", label: "of travellers plan to use AI to go off the beaten path", src: "Booking.com 2026 predictions" },
];
const MODELS = [
  { tag: "Main", title: "Cities license it", body: "Tourism boards turn their everyday streets into a guide." },
  { tag: "", title: "Travellers buy a city", body: "One story pack per city." },
  { tag: "", title: "Travel apps carry it", body: "Bundled with booking platforms and eSIMs." },
];

export const Business: React.FC = () => {
  const f = useCurrentFrame();
  const part2 = 110;
  const rule = 230;
  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: FONT, color: C.ink, padding: "110px 150px", gap: 34 }}>
      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 5, color: C.sub }}>BUSINESS</div>
      {f < part2 ? (
        <>
          <Rise text="Travellers already love ordinary streets." size={60} weight={800} delay={2} />
          <div style={{ display: "flex", gap: 30, marginTop: 30 }}>
            {MARKET.map((m, i) => {
              const p = interpolate(f - 16 - i * 8, [0, 12], [0, 1], { ...clamp, easing: ease });
              return (
                <div key={m.n} style={{ flex: 1, background: C.paper, border: `2px solid ${C.line}`, borderRadius: 24, padding: "34px 34px", boxShadow: "0 18px 40px rgba(0,0,0,0.08)", opacity: p, transform: `translateY(${(1 - p) * 30}px)` }}>
                  <div style={{ fontSize: 96, fontWeight: 800, letterSpacing: -3 }}>{m.n}</div>
                  <div style={{ fontSize: 28, lineHeight: 1.35, marginTop: 8 }}>{m.label}</div>
                  <div style={{ fontSize: 20, color: C.sub, marginTop: 14 }}>{m.src}</div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <Rise text="How it makes money" size={60} weight={800} delay={part2} />
          <div style={{ display: "flex", gap: 30, marginTop: 30 }}>
            {MODELS.map((m, i) => {
              const p = interpolate(f - part2 - 14 - i * 10, [0, 12], [0, 1], { ...clamp, easing: ease });
              return (
                <div key={m.title} style={{ flex: 1, background: i === 0 ? C.ink : C.paper, color: i === 0 ? C.white : C.ink, border: `2px solid ${i === 0 ? C.ink : C.line}`, borderRadius: 24, padding: "34px", boxShadow: "0 18px 40px rgba(0,0,0,0.1)", opacity: p, transform: `translateY(${(1 - p) * 30}px)` }}>
                  <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 4, opacity: 0.6 }}>{`0${i + 1}${m.tag ? " · " + m.tag.toUpperCase() : ""}`}</div>
                  <div style={{ fontSize: 46, fontWeight: 800, marginTop: 14, letterSpacing: -1 }}>{m.title}</div>
                  <div style={{ fontSize: 26, lineHeight: 1.4, marginTop: 12, opacity: 0.75 }}>{m.body}</div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 40, alignSelf: "flex-start", opacity: interpolate(f, [rule, rule + 10], [0, 1], clamp), transform: `scale(${interpolate(f, [rule, rule + 6, rule + 10], [0.8, 1.04, 1], clamp)})`, transformOrigin: "left center" }}>
            <div style={{ background: C.white, border: `2px solid ${C.ink}`, borderRadius: 999, padding: "18px 34px", fontSize: 34, fontWeight: 800 }}>No sponsored stories. What it tells you can never be bought.</div>
          </div>
        </>
      )}
    </AbsoluteFill>
  );
};

// ---------- next: Meta glasses ----------
export const Glasses: React.FC = () => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const push = interpolate(f, [0, durationInFrames], [1.05, 1.18]);
  const ask = 40;
  const story = 96;
  const snap = 200;
  const flash = interpolate(f - snap, [0, 2, 10], [0, 0.9, 0], clamp);
  const shrink = interpolate(f - snap - 6, [0, 18], [0, 1], { ...clamp, easing: ease });
  const textOut = f > 300;
  return (
    <AbsoluteFill style={{ background: C.night, fontFamily: FONT, color: C.white, overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `scale(${push})` }}>
        <Img src={staticFile("pov/postbox.webp")} style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.9)" }} />
      </AbsoluteFill>
      {/* glasses frame: two soft lenses, dark around them */}
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <mask id="lenses">
            <rect width="1920" height="1080" fill="white" />
            <rect x="120" y="150" width="790" height="700" rx="260" fill="black" />
            <rect x="1010" y="150" width="790" height="700" rx="260" fill="black" />
          </mask>
        </defs>
        <rect width="1920" height="1080" fill="rgba(10,10,10,0.88)" mask="url(#lenses)" />
        <rect x="120" y="150" width="790" height="700" rx="260" fill="none" stroke="#2C2A28" strokeWidth="22" />
        <rect x="1010" y="150" width="790" height="700" rx="260" fill="none" stroke="#2C2A28" strokeWidth="22" />
        <path d="M 910 330 Q 960 290 1010 330" fill="none" stroke="#2C2A28" strokeWidth="22" />
      </svg>
      <AbsoluteFill style={{ background: C.white, opacity: flash }} />
      {f >= ask && f < story + 70 && (
        <div style={{ position: "absolute", left: 300, top: 300, background: C.white, color: C.ink, padding: "16px 26px", borderRadius: 22, fontSize: 36, fontWeight: 700, transform: `scale(${interpolate(f - ask, [0, 5, 8], [0.6, 1.06, 1], clamp)})`, transformOrigin: "left bottom", boxShadow: "0 16px 40px rgba(0,0,0,0.4)" }}>
          “What are these two boxes?”
        </div>
      )}
      {f >= story && f < snap + 30 && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 260, display: "flex", justifyContent: "center", opacity: interpolate(f - story, [0, 8], [0, 1], clamp) }}>
          <div style={{ maxWidth: 1200, background: "rgba(17,17,17,0.78)", padding: "20px 30px", borderRadius: 18, fontSize: 32, fontWeight: 500, lineHeight: 1.4, textAlign: "center" }}>
            <span style={{ opacity: 0.6, marginRight: 12 }}>🎧</span>Red takes express and airmail, green takes ordinary mail — the wrong slot costs you days.
          </div>
        </div>
      )}
      {f >= snap && (
        <div
          style={{
            position: "absolute",
            left: interpolate(shrink, [0, 1], [120, 1560]),
            top: interpolate(shrink, [0, 1], [150, 760]),
            width: interpolate(shrink, [0, 1], [790, 240]),
            height: interpolate(shrink, [0, 1], [700, 170]),
            borderRadius: 20,
            overflow: "hidden",
            border: `6px solid ${C.white}`,
            boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
            opacity: shrink > 0 ? 1 : 0,
            transform: `rotate(${shrink * 6}deg)`,
          }}
        >
          <Img src={staticFile("pov/postbox.webp")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      )}
      {f >= snap + 24 && (
        <div style={{ position: "absolute", left: 1560, top: 945, fontSize: 22, fontWeight: 700, color: C.white, opacity: interpolate(f - snap - 24, [0, 8], [0, 1], clamp) }}>→ saved to your notebook</div>
      )}
      <div style={{ position: "absolute", left: 140, top: 52, display: "flex", alignItems: "baseline", gap: 24, opacity: textOut ? 0 : 1 }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 5, color: C.subDark }}>NEXT</div>
        <div style={{ fontSize: 40, fontWeight: 800 }}>On Meta glasses: look, wonder, hear.</div>
      </div>
      {textOut && (
        <AbsoluteFill style={{ background: `rgba(17,17,17,${interpolate(f, [300, 310], [0, 0.92], clamp)})`, alignItems: "center", justifyContent: "center", textAlign: "center", gap: 20 }}>
          <Rise text="Phone today. Glasses next." size={100} weight={800} color={C.white} delay={304} stagger={2} />
          <div style={{ fontSize: 28, color: C.subDark, opacity: interpolate(f, [320, 330], [0, 1], clamp) }}>Hands-free, eyes up — when Meta's glasses toolkit opens beyond developer preview.</div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

// ---------- end card with the collage wordmark ----------
export const EndCollage: React.FC = () => {
  const f = useCurrentFrame();
  const fade = interpolate(f, [50, 66], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ background: C.paper, fontFamily: FONT, color: C.ink, alignItems: "center", justifyContent: "center", gap: 40 }}>
      <Wordmark size={150} delay={4} step={2} />
      <div style={{ opacity: interpolate(f, [34, 46], [0, 1], clamp), fontSize: 44, fontWeight: 600, color: C.sub }}>Same street. Different stories.</div>
      <div style={{ opacity: fade, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, fontSize: 26, color: C.sub }}>
        <div style={{ color: C.ink, fontWeight: 700 }}>chitchat-tour.vercel.app · github.com/jielle2453/chitchat-tour</div>
        <div>Built during the Meta Global AI Developer Hackathon, Oct 27 – Nov 4, 2026</div>
      </div>
    </AbsoluteFill>
  );
};

export const BARS = { BAR };

// ---------- same corner, two visitors ----------
const HL: React.FC<{ y0: number; y1: number; at: number; H: number }> = ({ y0, y1, at, H }) => {
  const f = useCurrentFrame();
  const k = interpolate(f - at, [0, 8], [0, 1], clamp);
  return <div style={{ position: "absolute", left: 8, right: 8, top: (y0 / 1864) * H - 4, height: ((y1 - y0) / 1864) * H + 8, borderRadius: 12, border: `3px solid ${C.ink}`, background: "rgba(242,240,237,0.3)", opacity: k, transform: `scale(${0.96 + 0.04 * k})` }} />;
};

const SIDES3 = [
  {
    from: "From Tokyo",
    card: "captures/corner-jp-card.png",
    trace: "captures/corner-jp-trace.png",
    cardHL: { y0: 1556 - 51, y1: 1640 - 51 },
    traceHL: { y0: 1110 - 12, y1: 1352 - 12 },
    cardShift: 51,
    traceShift: 12,
    line1: ["Compared with Tokyo", "“Just don't bother others.”"],
    line2: ["No turning on red", "New to you · 0.53"],
    bg: C.night,
    fg: C.white,
  },
  {
    from: "From New York",
    card: "captures/corner-us-card.png",
    trace: "captures/corner-us-trace.png",
    cardHL: { y0: 1508, y1: 1640 },
    traceHL: { y0: 850, y1: 1102 },
    cardShift: 0,
    traceShift: 0,
    line1: ["Compared with New York", "“No blanket ban on snacking.”"],
    line2: ["No turning on red", "Same as home · 0.45"],
    bg: C.paper,
    fg: C.ink,
  },
];

export const SkipCompare: React.FC = () => {
  const f = useCurrentFrame();
  const part2 = 230;
  const H = 760;
  const PW = (H * 430) / 932 + H * 0.036; // phone incl. bezel
  const GAP = 150;
  return (
    <AbsoluteFill style={{ fontFamily: FONT, background: C.night }}>
      {SIDES3.map((sd, i) => {
        const slide = interpolate(f - i * 4, [0, 12], [1, 0], { ...clamp, easing: ease });
        const phoneIn = interpolate(f - 8 - i * 5, [0, 14], [0, 1], { ...clamp, easing: ease });
        const swap = interpolate(f, [part2 - 6, part2 + 6], [0, 1], clamp);
        const pillAt = (part2 > f ? 70 : part2 + 40) + i * 22;
        const pk = interpolate(f - pillAt, [0, 6, 10], [0, 1.08, 1], clamp);
        return (
          <div key={sd.from} style={{ position: "absolute", top: 0, bottom: 0, left: i * 960, width: 960, background: sd.bg, color: sd.fg, overflow: "hidden", transform: `translateX(${slide * (i ? 100 : -100)}%)` }}>
            <div style={{ position: "absolute", left: i ? GAP / 2 : 960 - GAP / 2 - PW, width: PW, top: 150, textAlign: "center", fontSize: 26, fontWeight: 800, letterSpacing: 6, textTransform: "uppercase", opacity: 0.6 }}>{sd.from}</div>
            <div style={{ position: "absolute", left: i ? GAP / 2 : 960 - GAP / 2 - PW, top: 200, transform: `translateY(${(1 - phoneIn) * 600}px)` }}>
              <div style={{ position: "relative" }}>
                <div style={{ opacity: 1 - swap }}>
                  <Phone src={sd.card} height={H} shiftY={sd.cardShift} screenBg="#FFFFFF">
                    <HL y0={sd.cardHL.y0} y1={sd.cardHL.y1} at={50 + i * 22} H={H} />
                  </Phone>
                </div>
                <div style={{ position: "absolute", inset: 0, opacity: swap }}>
                  <Phone src={sd.trace} height={H} shiftY={sd.traceShift} screenBg="#FFFFFF">
                    <HL y0={sd.traceHL.y0} y1={sd.traceHL.y1} at={part2 + 24 + i * 22} H={H} />
                  </Phone>
                </div>
              </div>
            </div>
            <div style={{ position: "absolute", left: (i ? GAP / 2 : 960 - GAP / 2 - PW) + PW / 2 - 250, width: 500, top: 900, display: "flex", justifyContent: "center", transform: `scale(${pk})`, opacity: Math.min(1, pk * 2) }}>
              <div style={{ background: sd.fg, color: sd.bg, width: 460, height: 104, borderRadius: 20, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, boxShadow: "0 20px 50px rgba(0,0,0,0.3)" }}>
                <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", opacity: 0.6 }}>{(f < part2 ? sd.line1 : sd.line2)[0]}</div>
                <div style={{ fontSize: 27, fontWeight: 800 }}>{(f < part2 ? sd.line1 : sd.line2)[1]}</div>
              </div>
            </div>
          </div>
        );
      })}
      <div style={{ position: "absolute", left: 0, right: 0, top: 46, display: "flex", justifyContent: "center" }}>
        <div style={{ background: C.white, color: C.ink, border: `2px solid ${C.ink}`, borderRadius: 999, padding: "14px 34px", fontSize: 40, fontWeight: 800, boxShadow: "0 18px 40px rgba(0,0,0,0.25)" }}>
          {f < part2 ? "Same corner. Same story. Told for each visitor." : "And it skips what you already know."}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---------- YouTube thumbnail (render as a still) ----------
export const Thumbnail: React.FC = () => (
  <AbsoluteFill style={{ background: C.night, fontFamily: FONT, overflow: "hidden" }}>
    <AbsoluteFill style={{ transform: "scale(1.08) translateX(6%)" }}>
      <Img src={staticFile("pov/postbox.webp")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </AbsoluteFill>
    <AbsoluteFill style={{ background: "linear-gradient(90deg, rgba(17,17,17,0.96) 0%, rgba(17,17,17,0.9) 38%, rgba(17,17,17,0.25) 70%, rgba(17,17,17,0.1) 100%)" }} />
    <div style={{ position: "absolute", left: 90, top: 110, transform: "scale(0.9)", transformOrigin: "left top" }}>
      <Wordmark size={112} delay={-200} />
    </div>
    <div style={{ position: "absolute", left: 100, top: 470, width: 900 }}>
      <div style={{ fontSize: 112, fontWeight: 800, letterSpacing: -4, lineHeight: 1, color: C.white }}>Same street.</div>
      <div style={{ fontSize: 112, fontWeight: 800, letterSpacing: -4, lineHeight: 1.05, color: C.white }}>Different stories.</div>
      <div style={{ marginTop: 30, fontSize: 38, fontWeight: 600, color: "#D6D1CA" }}>A walking guide that speaks first — built with Meta's Muse models</div>
    </div>
    <div style={{ position: "absolute", left: 1330, top: 90, transform: "rotate(5deg)" }}>
      <Phone src="captures/corner-jp-card.png" height={900} shiftY={180} screenBg="#FFFFFF" />
    </div>
    <div style={{ position: "absolute", left: 1170, top: 120, width: 96, height: 96, borderRadius: 99, background: C.white, color: C.ink, fontSize: 64, fontWeight: 800, display: "grid", placeItems: "center", boxShadow: "0 16px 40px rgba(0,0,0,0.45)" }}>?</div>
  </AbsoluteFill>
);
