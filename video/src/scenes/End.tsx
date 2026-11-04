import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Bg, ease, Eyebrow, Rise } from "../components/ui";
import { C } from "../theme";

const MODELS: [string, string][] = [
  ["Muse Spark 1.3", "decides when to speak, writes each line for you"],
  ["web_search", "researches new places, returns the sources"],
  ["Muse Spark vision", "finds the object in your photo"],
  ["SAM 3.1", "cuts it out into a sticker, finds people to blur"],
  ["Muse Voice Transcribe", "hold to ask a question"],
  ["Muse Image", "the story stickers"],
];

export const Models: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Bg>
      <div style={{ position: "absolute", left: 200, top: 150, display: "flex", flexDirection: "column", gap: 20 }}>
        <Eyebrow>Built with Meta models</Eyebrow>
        <Rise text="Six models, one quiet guide." size={72} weight={700} delay={4} />
      </div>
      <div style={{ position: "absolute", left: 200, top: 400, display: "flex", flexDirection: "column", gap: 0, width: 1520 }}>
        {MODELS.map(([m, what], i) => {
          const p = interpolate(f - 10 - i * 5, [0, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
          return (
            <div key={m} style={{ display: "flex", alignItems: "baseline", gap: 40, padding: "20px 0", borderTop: `1px solid ${C.line}`, opacity: p, transform: `translateX(${(1 - p) * -30}px)` }}>
              <div style={{ width: 520, fontSize: 38, fontWeight: 700, letterSpacing: -0.6 }}>{m}</div>
              <div style={{ fontSize: 30, color: C.sub }}>{what}</div>
            </div>
          );
        })}
      </div>
    </Bg>
  );
};

export const EndCard: React.FC = () => {
  const f = useCurrentFrame();
  const fade = interpolate(f, [30, 50], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Bg color={C.ink}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center", gap: 30 }}>
        <Rise text="Chitchat Tour" size={120} weight={700} color={C.white} delay={4} />
        <Rise text="Same street. Different stories." size={48} weight={500} color="#BDBDBD" delay={20} />
        <div style={{ marginTop: 50, opacity: fade, display: "flex", flexDirection: "column", gap: 14, fontSize: 28, color: "#9A9A9A" }}>
          <div style={{ color: C.white, fontWeight: 600 }}>chitchat-tour.vercel.app · github.com/jielle2453/chitchat-tour</div>
          <div>Built during the Meta Global AI Developer Hackathon, Oct 27 – Nov 4, 2026</div>
        </div>
      </AbsoluteFill>
    </Bg>
  );
};
