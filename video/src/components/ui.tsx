import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT } from "../theme";

export const ease = Easing.bezier(0.22, 1, 0.36, 1);

export function useIn(delay = 0, dur = 18) {
  const f = useCurrentFrame();
  return interpolate(f - delay, [0, dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
}

export function useOut(start: number, dur = 12) {
  const f = useCurrentFrame();
  return interpolate(f - start, [0, dur], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
}

export function usePop(delay = 0, damping = 12) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: f - delay, fps, config: { damping, stiffness: 160, mass: 0.7 } });
}

export const Bg: React.FC<{ color?: string; children?: React.ReactNode }> = ({ color = C.bg, children }) => (
  <AbsoluteFill style={{ background: color, fontFamily: FONT, color: C.ink }}>{children}</AbsoluteFill>
);

/** Words rise in one by one. */
export const Rise: React.FC<{
  text: string;
  delay?: number;
  size?: number;
  weight?: number;
  color?: string;
  stagger?: number;
  italic?: boolean;
  style?: React.CSSProperties;
}> = ({ text, delay = 0, size = 64, weight = 600, color = C.ink, stagger = 3, italic, style }) => {
  const f = useCurrentFrame();
  const words = text.split(" ");
  return (
    <div style={{ fontSize: size, fontWeight: weight, color, lineHeight: 1.12, letterSpacing: -size * 0.025, fontStyle: italic ? "italic" : undefined, ...style }}>
      {words.map((w, i) => {
        const p = interpolate(f - delay - i * stagger, [0, 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
        return (
          <span key={i} style={{ display: "inline-block", overflow: "hidden", verticalAlign: "bottom", paddingBottom: size * 0.08 }}>
            <span style={{ display: "inline-block", transform: `translateY(${(1 - p) * 100}%)`, opacity: p }}>
              {w}
              {i < words.length - 1 ? " " : ""}
            </span>
          </span>
        );
      })}
    </div>
  );
};

/** Small uppercase label. */
export const Eyebrow: React.FC<{ children: React.ReactNode; delay?: number; color?: string }> = ({ children, delay = 0, color = C.sub }) => {
  const p = useIn(delay, 14);
  return (
    <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: 4, textTransform: "uppercase", color, opacity: p, transform: `translateY(${(1 - p) * 10}px)` }}>
      {children}
    </div>
  );
};

/** A die-cut sticker image (white outline + soft shadow). */
export const Sticker: React.FC<{ id: string; size: number; style?: React.CSSProperties }> = ({ id, size, style }) => (
  <Img
    src={staticFile(`stickers/${id}.png`)}
    style={{
      width: size,
      height: size,
      objectFit: "contain",
      filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.12)) drop-shadow(0 12px 20px rgba(0,0,0,0.14))",
      ...style,
    }}
  />
);

/** Pill tag naming a Meta model. */
export const ModelTag: React.FC<{ label: string; delay?: number; dark?: boolean }> = ({ label, delay = 0, dark }) => {
  const p = usePop(delay, 14);
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 22px",
        borderRadius: 999,
        background: dark ? C.ink : C.white,
        color: dark ? C.white : C.ink,
        fontSize: 24,
        fontWeight: 600,
        boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
        border: dark ? "none" : `1px solid ${C.line}`,
        transform: `scale(${0.6 + 0.4 * p})`,
        opacity: Math.min(1, p * 1.5),
        transformOrigin: "left center",
      }}
    >
      <span style={{ width: 10, height: 10, borderRadius: 99, background: dark ? C.white : C.ink }} />
      {label}
    </div>
  );
};
