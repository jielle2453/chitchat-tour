import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { ease, Rise } from "../components/ui";
import { C, FONT } from "../theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const Box: React.FC<{ x: number; y: number; w: number; title: string; sub: string; at: number; tone?: "light" | "solid" | "muted" }> = ({ x, y, w, title, sub, at, tone = "light" }) => {
  const f = useCurrentFrame();
  const p = interpolate(f - at, [0, 10], [0, 1], { ...clamp, easing: ease });
  const bg = tone === "solid" ? C.white : tone === "muted" ? "#CFC9C1" : C.paper;
  const fg = C.ink;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        padding: "26px 30px",
        borderRadius: 22,
        background: bg,
        color: fg,
        border: tone === "solid" ? `4px solid ${C.white}` : "none",
        outline: tone === "solid" ? "3px solid #8C867F" : "none",
        boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
        opacity: p,
        transform: `translateY(${(1 - p) * 24}px) scale(${0.95 + 0.05 * p})`,
      }}
    >
      <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: -0.6 }}>{title}</div>
      <div style={{ fontSize: 23, marginTop: 8, color: C.sub, lineHeight: 1.35 }}>{sub}</div>
    </div>
  );
};

const Line: React.FC<{ d: string; at: number; len: number }> = ({ d, at, len }) => {
  const f = useCurrentFrame();
  const p = interpolate(f - at, [0, 9], [0, 1], { ...clamp, easing: ease });
  return <path d={d} fill="none" stroke="#8C867F" strokeWidth={3} strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - p)} />;
};

/** How a story is allowed to be spoken. */
export const TrustDiagram: React.FC = () => {
  const f = useCurrentFrame();
  const shh = interpolate(f - 104, [0, 6, 9, 12], [0, 1.25, 0.95, 1], clamp);
  return (
    <AbsoluteFill style={{ background: C.night, fontFamily: FONT, color: C.white }}>
      <div style={{ position: "absolute", left: 140, top: 110, display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 5, color: C.subDark }}>UNDER THE HOOD</div>
        <Rise text="Never say what we can't source." size={72} weight={800} delay={2} color={C.white} />
      </div>
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        <Line d="M 520 580 L 640 580" at={24} len={120} />
        <Line d="M 1040 580 L 1160 580" at={48} len={120} />
        <Line d="M 1560 580 L 1600 580 L 1600 490 L 1620 490" at={72} len={220} />
        <Line d="M 1600 580 L 1600 710 L 1620 710" at={72} len={150} />
      </svg>
      <Box x={140} y={490} w={380} title="Something ahead" sub="OpenStreetMap places near your next steps" at={12} />
      <Box x={640} y={490} w={400} title="Muse Spark 1.3" sub="+ web_search researches it, step by step" at={36} tone="solid" />
      <Box x={1160} y={490} w={400} title="Source check" sub="Only government, universities, major press" at={60} />
      <Box x={1620} y={420} w={240} title="Speak" sub="with the links" at={84} tone="solid" />
      <Box x={1620} y={640} w={240} title="Stay quiet" sub="no good source" at={94} tone="muted" />
      <div style={{ position: "absolute", left: 1790, top: 610, padding: "8px 16px", borderRadius: 999, background: C.ink, color: C.white, border: "2px solid #8C867F", fontSize: 24, fontWeight: 800, transform: `scale(${shh}) rotate(8deg)` }}>shh</div>
      <AbsoluteFill style={{ justifyContent: "flex-end", padding: "0 140px 100px" }}>
        <div style={{ display: "flex", gap: 60, fontSize: 28, color: C.subDark, opacity: interpolate(f, [120, 132], [0, 1], clamp) }}>
          <span>
            <b style={{ color: C.white }}>51</b> hand-checked stories, each with sources
          </span>
          <span>
            Compared with <b style={{ color: C.white }}>your hometown</b> — or not at all
          </span>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
