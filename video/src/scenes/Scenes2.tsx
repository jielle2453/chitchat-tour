import React from "react";
import { AbsoluteFill, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Phone, type Segment } from "../components/Phone";
import { ease, ModelTag, Rise } from "../components/ui";
import { BEAT, C, FONT, FPS } from "../theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export type Cap = { at: number; eyebrow?: string; title: string; body?: string; tags?: string[] };
export type Zoom = { at: number; scale: number; ox: number; oy: number }; // origin as 0–1 of the phone

function zoomAt(zs: Zoom[], f: number) {
  if (!zs.length) return { scale: 1, ox: 0.5, oy: 0.5 };
  let a = zs[0];
  let b = zs[0];
  for (let i = 0; i < zs.length; i++) {
    if (zs[i].at <= f) a = zs[i];
    if (zs[i].at > f) {
      b = zs[i];
      break;
    }
    b = zs[i];
  }
  if (a === b) return a;
  const t = ease(Math.min(1, (f - a.at) / Math.min(24, b.at - a.at)));
  return { scale: a.scale + (b.scale - a.scale) * t, ox: a.ox + (b.ox - a.ox) * t, oy: a.oy + (b.oy - a.oy) * t };
}

const Eyebrow: React.FC<{ children: React.ReactNode; color: string }> = ({ children, color }) => (
  <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 5, textTransform: "uppercase", color }}>{children}</div>
);

/** A feature on a coloured backdrop: phone with push-ins, captions that change. */
export const Feature: React.FC<{
  src: string;
  segments?: Segment[];
  startFrom?: number;
  caps: Cap[];
  side?: "left" | "right";
  bg?: string;
  dark?: boolean;
  zooms?: Zoom[];
  extra?: React.ReactNode;
}> = ({ src, segments, startFrom = 0, caps, side = "right", bg = C.night, dark = true, zooms = [], extra }) => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const enter = interpolate(f, [0, 14], [0, 1], { ...clamp, easing: ease });
  const drift = interpolate(f, [0, durationInFrames], [0, 1]);
  const z = zoomAt(zooms, f);
  const current = [...caps].reverse().find((c) => f >= c.at) ?? caps[0];
  const idx = caps.indexOf(current);
  const nextAt = caps[idx + 1]?.at;
  const out = nextAt === undefined ? 1 : interpolate(f, [nextAt - 6, nextAt], [1, 0], clamp);
  const phoneH = 900;
  const phoneW = (phoneH * 430) / 932 + phoneH * 0.036;
  const phoneLeft = side === "right" ? 1160 : 230;
  const textLeft = side === "right" ? 170 : 1000;
  const fg = dark ? C.white : C.ink;
  const sub = dark ? C.subDark : C.sub;
  const glow = dark ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.5)";
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at ${side === "right" ? "70%" : "30%"} 50%, ${glow}, transparent 60%), ${bg}`, fontFamily: FONT, color: fg, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: phoneLeft,
          top: 74,
          transform: `translateX(${(1 - enter) * (side === "right" ? 700 : -700)}px) translateY(${-drift * 14}px) rotate(${(1 - enter) * (side === "right" ? 10 : -10)}deg) scale(${z.scale})`,
          transformOrigin: `${z.ox * phoneW}px ${z.oy * (phoneH + 32)}px`,
        }}
      >
        <Phone src={src} video segments={segments} startFrom={Math.round(startFrom * FPS)} height={phoneH} />
      </div>
      <div style={{ position: "absolute", left: textLeft, top: 0, bottom: 0, width: 740, display: "flex", flexDirection: "column", justifyContent: "center", gap: 24, opacity: out }}>
        <Sequence key={idx} from={current.at} layout="none">
          <CapBlock cap={current} fg={fg} sub={sub} dark={dark} />
        </Sequence>
      </div>
      {extra}
    </AbsoluteFill>
  );
};

const CapBlock: React.FC<{ cap: Cap; fg: string; sub: string; dark: boolean }> = ({ cap, fg, sub, dark }) => {
  const f = useCurrentFrame();
  const bodyIn = interpolate(f, [8, 20], [0, 1], { ...clamp, easing: ease });
  return (
    <>
      {cap.eyebrow && <Eyebrow color={sub}>{cap.eyebrow}</Eyebrow>}
      <Rise text={cap.title} size={70} weight={800} delay={0} stagger={2} color={fg} />
      {cap.body && <div style={{ fontSize: 32, lineHeight: 1.45, color: sub, opacity: bodyIn, transform: `translateY(${(1 - bodyIn) * 14}px)` }}>{cap.body}</div>}
      {cap.tags && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 6 }}>
          {cap.tags.map((t, i) => (
            <ModelTag key={t} label={t} delay={12 + i * 4} dark={!dark} />
          ))}
        </div>
      )}
    </>
  );
};

/** Pop-in card for numbers and notes. */
export const Pop: React.FC<{ at: number; x: number; y: number; children: React.ReactNode; until?: number; dark?: boolean }> = ({ at, x, y, children, until, dark }) => {
  const f = useCurrentFrame();
  if (f < at) return null;
  const k = interpolate(f - at, [0, 6, 10, 13], [0.4, 1.08, 0.98, 1], clamp);
  const out = until === undefined ? 1 : interpolate(f, [until - 6, until], [1, 0], clamp);
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        fontFamily: FONT,
        background: dark ? C.ink : C.white,
        color: dark ? C.white : C.ink,
        borderRadius: 18,
        padding: "18px 26px",
        border: `2px solid ${dark ? "#3A3632" : C.line}`,
        boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
        fontSize: 26,
        fontWeight: 700,
        transform: `scale(${k})`,
        transformOrigin: "left center",
        opacity: out,
      }}
    >
      {children}
    </div>
  );
};

// Phone panels inside the 2880x1800 compare recording.
const CROP = { left: { x: 629, y: 526 }, right: { x: 1473, y: 526 }, w: 778, h: 1274 };

const CroppedPhone: React.FC<{ which: "left" | "right"; height: number; startFrom: number }> = ({ which, height, startFrom }) => {
  const k = height / CROP.h;
  const w = CROP.w * k;
  const o = CROP[which];
  return (
    <div style={{ width: w + 24, height: height + 24, borderRadius: 46, background: "#0E0E0E", padding: 12, boxShadow: "0 40px 80px rgba(0,0,0,0.45), inset 0 0 0 2px #2A2A2A" }}>
      <div style={{ position: "relative", width: w, height, borderRadius: 36, overflow: "hidden", background: "#F4F4F2" }}>
        <OffthreadVideo
          src={staticFile("captures/compare.mp4")}
          startFrom={Math.round(startFrom * FPS)}
          muted
          style={{ position: "absolute", left: -o.x * k, top: -o.y * k, width: 2880 * k, height: 1800 * k, maxWidth: "none" }}
        />
      </div>
    </div>
  );
};

const SIDES = [
  {
    which: "left" as const,
    bg: C.night,
    fg: C.white,
    dim: "rgba(255,255,255,0.62)",
    mark: "rgba(255,255,255,0.14)",
    from: "From Tokyo",
    hears: "Back in Tokyo, the Metro's own FAQ puts no restriction on eating —",
    key: "Tokyo Metro: no eating ban on trains — just don't bother others.",
    src: "Source: Tokyo Metro FAQ",
  },
  {
    which: "right" as const,
    bg: C.paper,
    fg: C.ink,
    dim: "rgba(17,17,17,0.55)",
    mark: "#E4DFD7",
    from: "From New York",
    hears: "New York's transit rules fine littering and open containers —",
    key: "New York subway: no blanket ban on eating.",
    src: "Source: NYC Transit rules of conduct",
  },
];

/** Same entrance, two visitors: just the two phones, and the line that differs. */
export const SplitCompare: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: C.white, background: C.night }}>
      {SIDES.map((sd, i) => {
        const slide = interpolate(f - i * 4, [0, 12], [1, 0], { ...clamp, easing: ease });
        const phoneIn = interpolate(f - 8 - i * 5, [0, 14], [0, 1], { ...clamp, easing: ease });
        const keyIn = interpolate(f - (84 + i * 24), [0, 6, 10], [0, 1.08, 1], clamp);
        const H = 780;
        const W = (H * 778) / 1274 + 24;
        return (
          <div key={sd.which} style={{ position: "absolute", top: 0, bottom: 0, left: i === 0 ? 0 : 960, width: 960, background: sd.bg, color: sd.fg, transform: `translateX(${slide * (i === 0 ? -100 : 100)}%)`, overflow: "hidden" }}>
            <div style={{ position: "absolute", left: 0, right: 0, top: 62, textAlign: "center", fontSize: 26, fontWeight: 800, letterSpacing: 6, textTransform: "uppercase", color: sd.dim }}>{sd.from}</div>
            <div style={{ position: "absolute", left: (960 - W) / 2, top: 120, transform: `translateY(${(1 - phoneIn) * 600}px)` }}>
              <CroppedPhone which={sd.which} height={H} startFrom={2.4} />
            </div>
            <div style={{ position: "absolute", left: 60, right: 60, top: 846, display: "flex", justifyContent: "center", transform: `scale(${keyIn})`, opacity: Math.min(1, keyIn * 2) }}>
              <div style={{ background: sd.fg, color: sd.bg, padding: "18px 30px", borderRadius: 22, fontSize: 32, fontWeight: 800, letterSpacing: -0.5, textAlign: "center", maxWidth: 720, boxShadow: "0 24px 60px rgba(0,0,0,0.35)" }}>
                {sd.key}
                <div style={{ fontSize: 18, fontWeight: 600, opacity: 0.6, marginTop: 6, letterSpacing: 0 }}>{sd.src}</div>
              </div>
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const PAIRS = [
  ["Chatbots wait for you to ask.", "It speaks up first."],
  ["They don't know where you're from.", "It picks what's new to you."],
  ["They can be confidently wrong.", "No source, no story."],
];

/** Why not just ask a chatbot? Three quick contrasts. */
export const WhyUs: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.night, fontFamily: FONT, color: C.white, padding: "120px 170px", gap: 50 }}>
      <Rise text="Why not just ask a chatbot?" size={64} weight={800} color={C.white} />
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {PAIRS.map(([a, b], i) => {
          const at = 14 + i * BEAT * 3;
          const p = interpolate(f - at, [0, 10], [0, 1], { ...clamp, easing: ease });
          const q = interpolate(f - at - 10, [0, 10], [0, 1], { ...clamp, easing: ease });
          return (
            <div key={a} style={{ display: "flex", alignItems: "baseline", gap: 40, padding: "30px 0", borderTop: "1px solid #3A3632", opacity: p }}>
              <div style={{ width: 760, fontSize: 40, color: "#8C857D", fontWeight: 500, textDecoration: q > 0.5 ? "line-through" : "none", textDecorationColor: "#6A645D" }}>{a}</div>
              <div style={{ fontSize: 52, fontWeight: 800, letterSpacing: -1, opacity: q, transform: `translateX(${(1 - q) * 30}px)` }}>{b}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/** Impact line and what comes next. */
export const Next: React.FC = () => {
  const f = useCurrentFrame();
  const items = ["More cities — Tokyo, Seoul", "A native app that keeps talking with the screen off", "On Meta glasses: look, wonder, hear"];
  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: FONT, color: C.ink, padding: "150px 170px", gap: 40 }}>
      <Rise text="A reason to wander the streets between the sights." size={64} weight={800} />
      <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 5, color: C.sub, opacity: interpolate(f, [24, 32], [0, 1], clamp) }}>NEXT</div>
        {items.map((it, i) => {
          const p = interpolate(f - 30 - i * 8, [0, 10], [0, 1], { ...clamp, easing: ease });
          return (
            <div key={it} style={{ fontSize: 40, fontWeight: 600, opacity: p, transform: `translateX(${(1 - p) * -30}px)`, display: "flex", alignItems: "center", gap: 22 }}>
              <span style={{ width: 14, height: 14, borderRadius: 99, background: C.ink }} />
              {it}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
