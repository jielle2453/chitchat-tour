import React from "react";
import { AbsoluteFill, Img, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Phone, type Segment } from "../components/Phone";
import { Bg, ease, Eyebrow, ModelTag, Rise, usePop } from "../components/ui";
import { C, FONT, FPS } from "../theme";

/** Phone slides up into place and settles with a slow drift. */
const usePhoneMotion = (from: "right" | "left" | "bottom" = "bottom", tilt = 0) => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const p = interpolate(f, [0, 26], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const drift = interpolate(f, [0, durationInFrames], [0, 1]);
  const dx = from === "right" ? (1 - p) * 500 : from === "left" ? (1 - p) * -500 : 0;
  const dy = from === "bottom" ? (1 - p) * 700 : 0;
  return {
    transform: `translate(${dx}px, ${dy - drift * 18}px) rotate(${tilt * (1 - p * 0.6) + drift * -0.6}deg) scale(${1 + drift * 0.03})`,
    opacity: Math.min(1, p * 2),
  };
};

export type Cap = { at: number; eyebrow?: string; title: string; body?: string; tags?: string[] };

/** One feature: a phone on one side and captions that change over time. */
export const PhoneFeature: React.FC<{
  src: string;
  video?: boolean;
  startFrom?: number; // seconds
  rate?: number;
  side?: "left" | "right";
  caps: Cap[];
  phoneH?: number;
  overlay?: React.ReactNode;
  segments?: Segment[];
  extra?: React.ReactNode;
}> = ({ src, video, startFrom = 0, rate = 1, side = "right", caps, phoneH = 900, overlay, segments, extra }) => {
  const f = useCurrentFrame();
  const motion = usePhoneMotion(side === "right" ? "right" : "left", side === "right" ? 4 : -4);
  const current = [...caps].reverse().find((c) => f >= c.at) ?? caps[0];
  const idx = caps.indexOf(current);
  const nextAt = caps[idx + 1]?.at;
  const out = nextAt === undefined ? 1 : interpolate(f, [nextAt - 10, nextAt], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const textLeft = side === "right" ? 170 : 1080;
  const phoneLeft = side === "right" ? 1140 : 260;
  return (
    <Bg>
      <div style={{ position: "absolute", left: phoneLeft, top: (1080 - phoneH) / 2 - 16, ...motion }}>
        <Phone src={src} video={video} segments={segments} startFrom={Math.round(startFrom * FPS)} playbackRate={rate} height={phoneH}>
          {overlay}
        </Phone>
      </div>
      <div key={idx} style={{ position: "absolute", left: textLeft, top: 0, bottom: 0, width: 760, display: "flex", flexDirection: "column", justifyContent: "center", gap: 26, opacity: out }}>
        <Sequence from={current.at} layout="none">
          <CapBlock cap={current} />
        </Sequence>
      </div>
      {extra}
    </Bg>
  );
};

const CapBlock: React.FC<{ cap: Cap }> = ({ cap }) => {
  const f = useCurrentFrame();
  const bodyIn = interpolate(f, [14, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  return (
    <>
      {cap.eyebrow && <Eyebrow>{cap.eyebrow}</Eyebrow>}
      <Rise text={cap.title} size={66} weight={700} delay={2} stagger={2} />
      {cap.body && <div style={{ fontSize: 32, lineHeight: 1.45, color: C.sub, opacity: bodyIn, transform: `translateY(${(1 - bodyIn) * 14}px)` }}>{cap.body}</div>}
      {cap.tags && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 8 }}>
          {cap.tags.map((t, i) => (
            <ModelTag key={t} label={t} delay={22 + i * 6} dark={i === 0} />
          ))}
        </div>
      )}
    </>
  );
};

/** A floating callout card pinned somewhere on screen. */
export const Callout: React.FC<{ at: number; x: number; y: number; children: React.ReactNode; until?: number }> = ({ at, x, y, children, until = Infinity }) => {
  const f = useCurrentFrame();
  const k = usePop(at, 13);
  const out = Number.isFinite(until) ? interpolate(f, [until - 8, until], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;
  if (f < at) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        fontFamily: FONT,
        color: C.ink,
        background: C.white,
        borderRadius: 18,
        padding: "18px 24px",
        boxShadow: "0 18px 40px rgba(0,0,0,0.12)",
        border: `1px solid ${C.line}`,
        fontSize: 26,
        fontWeight: 600,
        transform: `scale(${k})`,
        transformOrigin: "left center",
        opacity: out,
      }}
    >
      {children}
    </div>
  );
};

/** Compare page recording inside a soft browser frame. */
export const CompareScene: React.FC<{ startFrom?: number }> = ({ startFrom = 0 }) => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const p = interpolate(f, [0, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const zoom = interpolate(f, [30, durationInFrames], [1, 1.04], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const W = 1400;
  const H = (W * 1800) / 2880;
  return (
    <Bg>
      <div style={{ position: "absolute", left: 0, right: 0, top: 46, textAlign: "center" }}>
        <Eyebrow>Same route · two visitors · one clock</Eyebrow>
      </div>
      <div
        style={{
          position: "absolute",
          left: (1920 - W) / 2,
          top: 170,
          width: W,
          height: H,
          borderRadius: 22,
          overflow: "hidden",
          boxShadow: "0 40px 90px rgba(0,0,0,0.16)",
          background: C.white,
          transform: `translateY(${(1 - p) * 120}px) scale(${zoom})`,
          transformOrigin: "50% 100%",
          opacity: p,
        }}
      >
        <div style={{ height: 40, background: "#EDEBE8", display: "flex", alignItems: "center", gap: 10, paddingLeft: 18 }}>
          {[0, 1, 2].map((i) => (
            <span key={i} style={{ width: 13, height: 13, borderRadius: 99, background: "#D4D1CC" }} />
          ))}
          <span style={{ marginLeft: 20, fontSize: 18, color: C.sub }}>chitchat-tour.vercel.app/demo/compare</span>
        </div>
        <OffthreadVideo src={staticFile("captures/compare.mp4")} startFrom={Math.round(startFrom * FPS)} muted style={{ width: W, height: H - 40, objectFit: "cover", objectPosition: "top" }} />
      </div>
    </Bg>
  );
};

/** Three notebook screens side by side. */
export const NotebookScene: React.FC = () => {
  const f = useCurrentFrame();
  const items = [
    { src: "captures/notebook-walks.mp4", label: "Walks", from: 0, rate: 0.55 },
    { src: "captures/walkpage.mp4", label: "Each walk", from: 10, rate: 0.9 },
    { src: "captures/themes.mp4", label: "Themes", from: 20, rate: 1, segments: [{ from: 0, dur: 15.2 }, { from: 17.2, dur: 5 }] },
  ];
  return (
    <Bg>
      <div style={{ position: "absolute", left: 0, right: 0, top: 60, textAlign: "center", display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
        <Eyebrow>The notebook</Eyebrow>
        <Rise text="Every walk becomes a page." size={60} weight={700} delay={4} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 225, display: "flex", justifyContent: "center", gap: 80 }}>
        {items.map((it, i) => {
          const p = interpolate(f - it.from, [0, 26], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
          const bob = Math.sin((f + i * 30) / 40) * 6;
          return (
            <div key={it.src} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, opacity: p, transform: `translateY(${(1 - p) * 300 + bob}px)` }}>
              <Sequence from={it.from} layout="none">
                <Phone src={it.src} video segments={"segments" in it ? it.segments : undefined} playbackRate={it.rate} height={640} />
              </Sequence>
              <div style={{ fontSize: 26, fontWeight: 600, color: C.sub }}>{it.label}</div>
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 34, textAlign: "center", fontSize: 26, color: C.sub, opacity: interpolate(f, [90, 110], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
        No scores, no badges — just what you noticed. Story stickers made with Muse Image.
      </div>
    </Bg>
  );
};

/** Title card with the real onboarding animation. */
export const TitleScene: React.FC = () => {
  const motion = usePhoneMotion("bottom", 0);
  return (
    <Bg>
      <div style={{ position: "absolute", left: 1150, top: 74, ...motion }}>
        <Phone src="captures/onboarding.mp4" video height={900} />
      </div>
      <AbsoluteFill style={{ left: 190, width: 860, justifyContent: "center", gap: 28 }}>
        <Eyebrow delay={8}>Introducing</Eyebrow>
        <Rise text="Chitchat Tour" size={124} weight={700} delay={12} />
        <Rise text="Little sourced stories about the street you're on." size={44} weight={500} color={C.sub} delay={30} stagger={2} />
      </AbsoluteFill>
    </Bg>
  );
};

export const StillImg: React.FC<{ src: string }> = ({ src }) => <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />;
