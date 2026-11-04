import React from "react";
import { AbsoluteFill, Audio, interpolate, Sequence, staticFile } from "remotion";
import { MapFly, reachFrame } from "./scenes/MapFly";
import { Title } from "./scenes/Hook";
import { TrustDiagram } from "./scenes/Trust";
import { Models } from "./scenes/End";
import { Feature, Pop, WhyUs } from "./scenes/Scenes2";
import { Built, Business, Decide, EndCollage, Glasses, PovHook, SkipCompare } from "./scenes/Scenes3";
import { Phone } from "./components/Phone";
import { Eyebrow, Rise, ease } from "./components/ui";
import stories from "./data/stories.json";
import { BAR, C, FONT } from "./theme";
import { useCurrentFrame } from "remotion";

const sec = (x: number) => Math.round(x * 30);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const MapCaption: React.FC = () => (
  <div style={{ position: "absolute", left: 110, top: 90, fontFamily: FONT, color: C.ink, display: "flex", flexDirection: "column", gap: 12, background: "rgba(244,244,242,0.94)", border: `2px solid ${C.line}`, padding: "24px 32px", borderRadius: 24, boxShadow: "0 20px 50px rgba(0,0,0,0.12)" }}>
    <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 5, color: C.sub }}>YONGKANG STREET, TAIPEI</div>
    <Rise text="A visitor from Tokyo goes for a walk." size={50} weight={800} delay={6} stagger={2} />
  </div>
);

const Hero = () => (
  <Feature
    src="captures/simwalk.mp4"
    segments={[
      { from: 1.0, dur: 10.4 },
      { from: 113.6, dur: 4.0 },
    ]}
    caps={[
      { at: 0, eyebrow: "Walk", title: "It speaks up only when something is there.", body: "One short story as you pass it — then quiet, so you can just walk." },
      { at: sec(4.6), eyebrow: "For you", title: "Picked for where you come from.", body: "A visitor from Tokyo hears how it works back home.", tags: ["Muse Spark 1.3"] },
      { at: sec(10.4), eyebrow: "Sourced", title: "Every line has a source you can open.", body: "Hand-checked stories, each compared with your hometown." },
    ]}
    zooms={[
      { at: 0, scale: 1, ox: 0.5, oy: 0.5 },
      { at: sec(1.6), scale: 1.32, ox: 0.5, oy: 0.82 },
      { at: sec(9.6), scale: 1, ox: 0.5, oy: 0.5 },
      { at: sec(10.8), scale: 1.28, ox: 0.5, oy: 0.86 },
      { at: sec(13.6), scale: 1.28, ox: 0.5, oy: 0.86 },
    ]}
    extra={
      <>
        <Pop at={sec(6.0)} until={sec(9.6)} x={820} y={820}>
          Compared with Tokyo →
        </Pop>
        <Pop at={sec(11.4)} x={780} y={250}>
          <div style={{ fontSize: 22, color: C.sub, fontWeight: 600 }}>Taiwan</div>
          <div style={{ fontSize: 38, fontWeight: 800 }}>1 store per 1,659 people</div>
          <div style={{ fontSize: 22, color: C.sub, fontWeight: 600, marginTop: 6 }}>Japan: 1 per 2,180</div>
        </Pop>
      </>
    }
  />
);

const Ask = () => (
  <Feature
    src="captures/ask.mp4"
    startFrom={2.4}
    caps={[{ at: 0, eyebrow: "Ask", title: "Curious about something? Ask.", body: "Hold to talk or type. The answer cites its sources.", tags: ["Muse Voice Transcribe", "Muse Spark 1.3 + web_search"] }]}
    zooms={[
      { at: 0, scale: 1, ox: 0.5, oy: 0.5 },
      { at: sec(2.6), scale: 1.3, ox: 0.5, oy: 0.8 },
    ]}
  />
);

const Photo = () => (
  <Feature
    src="captures/photo.mp4"
    side="left"
    bg={C.bg}
    dark={false}
    segments={[
      { from: 29.2, dur: 6.0 },
      { from: 47.6, dur: 3.6 },
    ]}
    caps={[
      { at: 0, eyebrow: "Photo", title: "Every object becomes a sticker.", body: "Muse Spark finds the objects. SAM 3.1 cuts them out. People are pixelated.", tags: ["Muse Spark vision", "SAM 3.1"] },
      { at: sec(6.0), eyebrow: "Photo", title: "Tap one to hear its story.", body: "Sample street photo generated with Muse Image." },
    ]}
    zooms={[
      { at: 0, scale: 1, ox: 0.5, oy: 0.5 },
      { at: sec(1.2), scale: 1.3, ox: 0.5, oy: 0.35 },
      { at: sec(5.4), scale: 1, ox: 0.5, oy: 0.5 },
    ]}
  />
);

export const DEST_SEGMENTS = [
  { from: 3.0, dur: 3.4 },
  { from: 17.6, dur: 2.4 },
  { from: 49.6, dur: 3.8 },
];

const Dest = () => (
  <Feature
    src="captures/dest.mp4"
    segments={DEST_SEGMENTS}
    caps={[
      { at: 0, eyebrow: "Go somewhere", title: "Pick a place. It walks you there.", body: "Spoken turn cues, rerouting, and small detours past something worth hearing about." },
    ]}
  />
);

/** Arrival → a new ticket, then the walk page and the jar. */
const Notebook3: React.FC = () => {
  const f = useCurrentFrame();
  const items = [
    { src: "captures/arrival2.mp4", label: "Arrive", from: 0, rate: 1, start: 0, segments: [{ from: 12.0, dur: 7.0 }, { from: 23.9, dur: 4.0 }, { from: 26.0, dur: 2.0 }] },
    { src: "captures/walkpage.mp4", label: "Each walk", from: 10, rate: 0.9, start: 0 },
    { src: "captures/themes.mp4", label: "Themes", from: 20, rate: 1, start: 0 },
  ];
  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: FONT, color: C.ink }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 54, display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
        <Eyebrow>The notebook</Eyebrow>
        <Rise text="Every walk becomes a page." size={60} weight={800} delay={4} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 225, display: "flex", justifyContent: "center", gap: 80 }}>
        {items.map((it, i) => {
          const p = interpolate(f - it.from, [0, 20], [0, 1], { ...clamp, easing: ease });
          const bob = Math.sin((f + i * 30) / 40) * 6;
          return (
            <div key={it.src} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, opacity: p, transform: `translateY(${(1 - p) * 300 + bob}px)` }}>
              <Sequence from={it.from} layout="none">
                <Phone src={it.src} video segments={"segments" in it ? it.segments : undefined} startFrom={it.start} playbackRate={it.rate} height={640} />
              </Sequence>
              <div style={{ fontSize: 26, fontWeight: 700, color: C.sub }}>{it.label}</div>
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 30, textAlign: "center", fontSize: 26, color: C.sub, opacity: interpolate(f, [90, 110], [0, 1], clamp) }}>
        No scores, no badges — just what you noticed. Story stickers made with Muse Image.
      </div>
    </AbsoluteFill>
  );
};

type Scene = { bars: number; el: React.ReactNode; whoosh?: boolean };
const SCENES: Scene[] = [
  { bars: 5, el: <PovHook /> },
  { bars: 2, el: <Title /> },
  {
    bars: 4,
    whoosh: true,
    el: (
      <>
        <MapFly />
        <MapCaption />
      </>
    ),
  },
  { bars: 6, el: <Hero />, whoosh: true },
  { bars: 8, el: <SkipCompare />, whoosh: true },
  { bars: 6, el: <Decide />, whoosh: true },
  { bars: 3, el: <TrustDiagram /> },
  { bars: 3, el: <Ask />, whoosh: true },
  { bars: 4, el: <Photo />, whoosh: true },
  { bars: 4, el: <Dest />, whoosh: true },
  { bars: 5, el: <Notebook3 />, whoosh: true },
  { bars: 3, el: <WhyUs />, whoosh: true },
  { bars: 3, el: <Built />, whoosh: true },
  { bars: 5, el: <Business />, whoosh: true },
  { bars: 6, el: <Glasses />, whoosh: true },
  { bars: 3, el: <Models />, whoosh: true },
  { bars: 3, el: <EndCollage /> },
];

const STARTS = SCENES.reduce<number[]>((acc, _sc, i) => [...acc, i === 0 ? 0 : acc[i - 1] + SCENES[i - 1].bars], []);
const TOTAL_BARS = STARTS[STARTS.length - 1] + SCENES[SCENES.length - 1].bars;
export const PROMO_FRAMES = TOTAL_BARS * BAR;
const at = (i: number) => STARTS[i] * BAR;

const Sfx: React.FC<{ from: number; name: string; vol?: number }> = ({ from, name, vol = 0.3 }) => (
  <Sequence from={Math.max(0, Math.round(from))} durationInFrames={90} layout="none">
    <Audio src={staticFile(`audio/${name}.wav`)} volume={vol} />
  </Sequence>
);

// Narration: [scene index, seconds into scene, file, seconds to keep (fade out), volume]
const VO: [number, number, string, number?, number?][] = [
  [0, 0.6, "v01"],
  [0, 9.5, "v02"],
  [1, 0.4, "v03"],
  [2, 0.5, "v04"],
  [3, 1.0, "ava0", 9.6, 0.95],
  [3, 10.4, "ava3", 4.0, 0.95],
  [4, 0.4, "v05"],
  [4, 9.8, "v06"],
  [5, 0.5, "v07"],
  [6, 0.3, "v08"],
  [7, 0.3, "v09"],
  [8, 0.3, "v10"],
  [9, 0.3, "v11"],
  [10, 0.4, "v12"],
  [11, 0.3, "v13"],
  [12, 0.3, "v14"],
  [13, 0.3, "v15"],
  [14, 0.2, "v16"],
  [14, 3.2, "v17", undefined, 0.9],
  [14, 10.1, "v18"],
  [15, 0.3, "v19"],
  [16, 0.8, "v20"],
];
const VO_LEN: Record<string, number> = { v01: 3.74, v02: 1.78, v03: 2.71, v04: 6.46, v05: 6.07, v06: 6.91, v07: 9.22, v08: 6.31, v09: 6.14, v10: 7.39, v11: 4.32, v12: 6.05, v13: 5.06, v14: 3.6, v15: 8.83, v16: 1.99, v17: 4.75, v18: 2.4, v19: 3.36, v20: 3.12, ava0: 24.6, ava3: 23.9 };

const Voice: React.FC<{ from: number; file: string; keep?: number; vol?: number }> = ({ from, file, keep, vol = 1 }) => {
  const len = Math.round((keep ?? VO_LEN[file]) * 30);
  return (
    <Sequence from={from} durationInFrames={len + 2} layout="none">
      <Audio src={staticFile(`vo/${file}.mp3`)} volume={(fr) => (keep ? interpolate(fr, [len - 16, len], [vol, 0], clamp) : vol)} />
    </Sequence>
  );
};

// Question bubbles in the hook, frame offsets within PovHook.
const HOOK_POPS = [26, 50, 96 + 16, 96 + 40, 192 + 14, 192 + 36, 192 + 52];

export const Promo: React.FC = () => {
  const end = PROMO_FRAMES;
  const drumsIn = at(1);
  const think = at(5);
  const askAt = at(7);
  const glasses = at(14);
  const modelsAt = at(15);
  const melody = (fr: number) => interpolate(fr, [0, 20, end - 70, end - 8], [0, 0.55, 0.55, 0], clamp);
  const drums = (fr: number) =>
    interpolate(
      fr,
      [drumsIn - 2, drumsIn, think - 6, think, askAt - 4, askAt, glasses - 6, glasses, modelsAt - 4, modelsAt, end - 70, end - 8],
      [0, 0.42, 0.42, 0.12, 0.12, 0.42, 0.42, 0.1, 0.1, 0.42, 0.42, 0],
      clamp,
    );
  const mapDur = SCENES[2].bars * BAR;
  const spans = VO.map(([sc, off, file, keep]) => {
    const a = at(sc) + Math.round(off * 30);
    return [a, a + Math.round((keep ?? VO_LEN[file]) * 30)] as const;
  });
  const duck = (fr: number) => {
    let d = 0;
    for (const [a, b] of spans) d = Math.max(d, interpolate(fr, [a - 8, a, b, b + 12], [0, 1, 1, 0], clamp));
    return 1 - 0.55 * d;
  };
  return (
    <AbsoluteFill style={{ background: C.night }}>
      <AbsoluteFill style={{ filter: "contrast(1.04) saturate(1.05)" }}>
        {SCENES.map((sc, i) => (
          <Sequence key={i} from={at(i)} durationInFrames={sc.bars * BAR}>
            {sc.el}
          </Sequence>
        ))}
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 50%, transparent 62%, rgba(0,0,0,0.16) 100%)", pointerEvents: "none" }} />

      <Audio src={staticFile("audio/v2_melody.wav")} volume={(fr) => melody(fr) * duck(fr)} />
      <Audio src={staticFile("audio/v2_drums.wav")} volume={(fr) => drums(fr) * (1 - (1 - duck(fr)) * 0.7)} />
      {VO.map(([sc, off, file, keep, vol]) => (
        <Voice key={`${file}`} from={at(sc) + Math.round(off * 30)} file={file} keep={keep} vol={vol} />
      ))}

      {HOOK_POPS.map((p, i) => (
        <Sfx key={`q${i}`} from={p} name="pop" vol={0.3} />
      ))}
      <Sfx from={92} name="whoosh" vol={0.3} />
      <Sfx from={188} name="whoosh" vol={0.3} />
      <Sfx from={288 - BAR} name="riser" vol={0.3} />
      <Sfx from={288} name="hit" vol={0.5} />
      <Sfx from={at(1)} name="hit" vol={0.45} />
      {SCENES.map((sc, i) => (sc.whoosh ? <Sfx key={`s${i}`} from={at(i) - 6} name="whoosh" vol={0.26} /> : null))}
      {stories.map((st) => (
        <Sfx key={st.itemId} from={at(2) + reachFrame(st.atM, mapDur)} name="pop" vol={0.2} />
      ))}
      <Sfx from={at(3) + sec(0.9)} name="chime" vol={0.28} />
      <Sfx from={at(4) + 230} name="whoosh" vol={0.25} />
      <Sfx from={at(14) + 200} name="tick" vol={0.5} />
      <Sfx from={at(16) - BAR} name="riser" vol={0.3} />
      <Sfx from={at(16)} name="hit" vol={0.5} />
      <Sfx from={at(16) + 8} name="arrive" vol={0.3} />
    </AbsoluteFill>
  );
};
