import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Phone } from "../components/Phone";
import { ease, Eyebrow, Rise, Sticker } from "../components/ui";
import { BAR, BEAT, C, FONT } from "../theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Text that slams in: overshoot scale + fade, on an exact frame. */
const Slam: React.FC<{ at: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ at, children, style }) => {
  const f = useCurrentFrame();
  if (f < at) return null;
  const k = interpolate(f - at, [0, 4, 9], [1.35, 0.97, 1], clamp);
  const o = interpolate(f - at, [0, 3], [0, 1], clamp);
  return <div style={{ transform: `scale(${k})`, opacity: o, ...style }}>{children}</div>;
};

const FACTS = [
  { id: "rooftop-water-tank", text: "Why is there a water tank on every roof?", bg: C.night2, fg: C.white },
  { id: "convenience-store-density", text: "One convenience store for every 1,659 people.", bg: C.paper, fg: C.ink },
  { id: "motorcycles-out-of-arcades", text: "Why scooters were pushed out of the arcades.", bg: C.ink, fg: C.white },
  { id: "pedestrian-flashing-green-rule", text: "The flashing green man got gentler in 2026.", bg: C.bg, fg: C.ink },
];

/** 5 bars: a fact that stops you, four quick ones, then the line. */
export const Hook: React.FC = () => {
  const f = useCurrentFrame();
  const countT = interpolate(f, [BAR + BEAT, BAR + BEAT * 2], [0, 1], clamp);
  const fine = Math.round(7500 * ease(countT));
  const hitAt = BAR + BEAT * 2;
  const shake = f >= hitAt && f < hitAt + 12 ? Math.sin((f - hitAt) * 2.4) * (12 - (f - hitAt)) * 1.4 : 0;
  const part1Out = interpolate(f, [BAR * 2 - 4, BAR * 2], [1, 0], clamp);
  const factsStart = BAR * 2;
  const factIdx = Math.floor((f - factsStart) / (BEAT * 2));
  const lineAt = BAR * 4;

  return (
    <AbsoluteFill style={{ background: C.night, fontFamily: FONT, color: C.white }}>
      {f < factsStart && (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: part1Out, transform: `translateX(${shake}px)` }}>
          <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div style={{ display: "flex", gap: 28, alignItems: "baseline", transform: `translateY(${interpolate(f, [BAR, BAR + 8], [0, -30], clamp)}px) scale(${interpolate(f, [BAR, BAR + 8], [1, 0.72], clamp)})` }}>
              <Slam at={BEAT} style={{ fontSize: 120, fontWeight: 800, letterSpacing: -4 }}>
                A sip of water
              </Slam>
            </div>
            <div style={{ transform: `translateY(${interpolate(f, [BAR, BAR + 8], [0, -40], clamp)}px) scale(${interpolate(f, [BAR, BAR + 8], [1, 0.8], clamp)})` }}>
              <Slam at={BEAT * 2.5} style={{ fontSize: 64, fontWeight: 600, color: C.subDark, letterSpacing: -1.5 }}>
                on the Taipei Metro can cost you up to
              </Slam>
            </div>
            {f >= BAR + BEAT && (
              <div style={{ fontSize: 230, fontWeight: 800, letterSpacing: -9, color: C.white, lineHeight: 1, marginTop: 10, transform: `scale(${f >= hitAt ? interpolate(f - hitAt, [0, 5, 10], [1.18, 0.98, 1], clamp) : 0.9})`, fontVariantNumeric: "tabular-nums" }}>
                NT${fine.toLocaleString("en-US")}
              </div>
            )}
            <Slam at={hitAt + BEAT} style={{ fontSize: 40, fontWeight: 500, color: C.subDark, marginTop: 10 }}>
              Fines run NT$1,500–7,500 under the Mass Rapid Transit Act.
            </Slam>
          </div>
        </AbsoluteFill>
      )}

      {f >= factsStart && f < lineAt && factIdx >= 0 && factIdx < FACTS.length && (
        <FactCard idx={factIdx} local={f - factsStart - factIdx * BEAT * 2} />
      )}

      {f >= lineAt && (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", background: C.night }}>
          <div style={{ textAlign: "center" }}>
            <Slam at={lineAt} style={{ fontSize: 96, fontWeight: 800, letterSpacing: -3, color: C.subDark }}>
              Every street is full of stories.
            </Slam>
            <Slam at={lineAt + BEAT * 2} style={{ fontSize: 96, fontWeight: 800, letterSpacing: -3, color: C.white }}>
              Nobody tells you.
            </Slam>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

const FactCard: React.FC<{ idx: number; local: number }> = ({ idx, local }) => {
  const fact = FACTS[idx];
  const slide = interpolate(local, [0, 7], [1, 0], { ...clamp, easing: ease });
  const stick = interpolate(local, [2, 8, 12, 15], [0, 1.15, 0.96, 1], clamp);
  return (
    <AbsoluteFill style={{ background: fact.bg, transform: `translateX(${slide * 100}%)` }}>
      <div style={{ position: "absolute", left: 180, top: 0, bottom: 0, display: "flex", alignItems: "center" }}>
        <div style={{ transform: `scale(${stick}) rotate(${idx % 2 ? 6 : -6}deg)` }}>
          <Sticker id={fact.id} size={440} />
        </div>
      </div>
      <div style={{ position: "absolute", left: 760, right: 160, top: 0, bottom: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 20 }}>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: 5, opacity: 0.55, color: fact.fg }}>{`0${idx + 1}`}</div>
        <div style={{ fontSize: 82, fontWeight: 800, letterSpacing: -2.5, lineHeight: 1.05, color: fact.fg, transform: `translateY(${slide * 40}px)` }}>{fact.text}</div>
      </div>
    </AbsoluteFill>
  );
};

/** 2 bars: the name, with the real onboarding animation. */
export const Title: React.FC = () => {
  const f = useCurrentFrame();
  const p = interpolate(f, [0, 14], [0, 1], { ...clamp, easing: ease });
  const ring = ["mrt-no-eating", "youbike-origin", "garbage-truck-why-music", "manhole-covers-art", "iron-window-bars", "breakfast-hot-food"];
  const pos = [
    [-640, -400, -10],
    [-820, 380, 8],
    [-250, 400, -6],
    [-60, -410, 7],
    [1060, -400, 5],
    [1060, 380, -4],
  ];
  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: FONT, color: C.ink }}>
      {ring.map((id, i) => {
        const k = interpolate(f - i * 2, [0, 8, 12], [0, 1.1, 1], clamp);
        const [x, y, r] = pos[i];
        return (
          <div key={id} style={{ position: "absolute", left: 760 + x * (0.6 + 0.4 * k) - 80, top: 540 + y * (0.6 + 0.4 * k) - 80, transform: `scale(${k}) rotate(${r}deg)`, opacity: 0.95 }}>
            <Sticker id={id} size={160} />
          </div>
        );
      })}
      <div style={{ position: "absolute", left: 1180, top: 70, transform: `translateY(${(1 - p) * 600}px) rotate(${(1 - p) * 8}deg)` }}>
        <Phone src="captures/onboarding.mp4" video startFrom={30} height={900} />
      </div>
      <AbsoluteFill style={{ left: 200, width: 900, justifyContent: "center", gap: 22 }}>
        <Eyebrow delay={4}>Introducing</Eyebrow>
        <Rise text="Chitchat Tour" size={140} weight={800} delay={6} stagger={3} />
        <Rise text="Little sourced stories about the street you're on." size={42} weight={500} color={C.sub} delay={18} stagger={2} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
