import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Bg, ease, Eyebrow, Rise, Sticker, usePop } from "../components/ui";
import { C } from "../theme";

const BEAT = 27.27;

const OPEN = [
  "mrt-no-eating",
  "rooftop-water-tank",
  "youbike-origin",
  "convenience-store-density",
  "garbage-truck-why-music",
  "manhole-covers-art",
  "pedestrian-flashing-green-rule",
  "iron-window-bars",
];
const OPEN_POS = [
  [-560, -230, -8],
  [520, -250, 7],
  [-700, 150, 5],
  [640, 170, -6],
  [-250, 300, -4],
  [260, -330, 4],
  [-80, -300, 9],
  [120, 330, -7],
];

/** Everyday things pop onto the page on the beat, then the line arrives. */
export const ColdOpen: React.FC = () => {
  const f = useCurrentFrame();
  const textAt = BEAT * 9;
  const drift = interpolate(f, [0, 400], [0, 1]);
  return (
    <Bg>
      {OPEN.map((id, i) => {
        const at = i * BEAT;
        const k = interpolate(f - at, [0, 6, 10, 14], [0, 1.15, 0.95, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const [x, y, r] = OPEN_POS[i];
        const shrink = interpolate(f, [textAt - 20, textAt + 10], [1, 0.62], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
        const fade = interpolate(f, [textAt - 20, textAt + 10], [1, 0.9], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return (
          <div
            key={id}
            style={{
              position: "absolute",
              left: 960 + x * (shrink * 0.4 + 0.6) * 1.25 - 150,
              top: 540 + y * 1.05 - 150 - drift * 12 * (i % 3),
              transform: `scale(${k * shrink}) rotate(${r + drift * (i % 2 ? 3 : -3)}deg)`,
              opacity: fade,
            }}
          >
            <Sticker id={id} size={300} />
          </div>
        );
      })}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", width: 1100 }}>
          <Rise text="Every street is full of" delay={textAt} size={80} />
          <Rise text="little things nobody explains." delay={textAt + 12} size={80} color={C.sub} />
        </div>
      </AbsoluteFill>
    </Bg>
  );
};

/** Landmarks vs the stuff in between; it depends where you're from. */
export const Problem: React.FC = () => {
  const f = useCurrentFrame();
  const strike = interpolate(f, [70, 92], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const swap = interpolate(f, [92, 110], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const part2 = 170;
  const out1 = interpolate(f, [part2 - 16, part2], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const tokyo = usePop(part2 + 50, 13);
  const ny = usePop(part2 + 62, 13);
  return (
    <Bg>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: out1 }}>
        <div style={{ width: 1500, textAlign: "center", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ opacity: 1 - 0.55 * swap }}>
            <Rise text="Guidebooks cover temples and night markets." size={68} weight={600} />
          </div>
          <div style={{ height: 6, width: 900 * strike, background: C.line, borderRadius: 4, alignSelf: "center", margin: "18px 0" }} />
          <div style={{ opacity: swap, transform: `translateY(${(1 - swap) * 30}px)` }}>
            <Rise text="Nobody covers the stuff in between." delay={92} size={80} weight={700} />
          </div>
        </div>
      </AbsoluteFill>
      {f >= part2 - 2 && (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 70 }}>
          <div style={{ textAlign: "center" }}>
            <Rise text="And what surprises you" delay={part2} size={72} />
            <Rise text="depends on where you're from." delay={part2 + 12} size={72} />
          </div>
          <div style={{ display: "flex", gap: 32 }}>
            {[
              ["From Tokyo", tokyo],
              ["From New York", ny],
            ].map(([label, k]) => (
              <div
                key={label as string}
                style={{
                  padding: "18px 36px",
                  borderRadius: 999,
                  background: C.white,
                  border: `1px solid ${C.line}`,
                  fontSize: 32,
                  fontWeight: 600,
                  boxShadow: "0 12px 30px rgba(0,0,0,0.07)",
                  transform: `scale(${k as number}) translateY(${(1 - (k as number)) * 40}px)`,
                }}
              >
                {label as string}
              </div>
            ))}
          </div>
        </AbsoluteFill>
      )}
    </Bg>
  );
};

/** A big statement on its own. */
export const Statement: React.FC<{ eyebrow?: string; lines: string[]; dark?: boolean; size?: number }> = ({ eyebrow, lines, dark, size = 96 }) => (
  <Bg color={dark ? C.ink : C.bg}>
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 28, textAlign: "center" }}>
      {eyebrow && <Eyebrow color={dark ? "#9A9A9A" : C.sub}>{eyebrow}</Eyebrow>}
      <div>
        {lines.map((l, i) => (
          <Rise key={i} text={l} delay={6 + i * 12} size={size} weight={700} color={dark ? C.white : C.ink} />
        ))}
      </div>
    </AbsoluteFill>
  </Bg>
);
