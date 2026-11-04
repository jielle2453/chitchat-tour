import React from "react";
import { Img, OffthreadVideo, Series, staticFile } from "remotion";

export type Segment = { src?: string; from: number; dur: number; rate?: number };

/** Phone frame around a capture (PNG or MP4, 430x932 aspect). */
export const Phone: React.FC<{
  src: string;
  height?: number;
  video?: boolean;
  segments?: Segment[]; // seconds; cuts between parts of one or more clips
  startFrom?: number;
  playbackRate?: number;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  shiftY?: number; // move a still up by this many source pixels (1864-px-tall captures)
  screenBg?: string;
}> = ({ src, height = 900, video, segments, startFrom = 0, playbackRate = 1, style, children, shiftY = 0, screenBg = "#F4F4F2" }) => {
  const w = (height * 430) / 932;
  const bezel = height * 0.018;
  const radius = height * 0.07;
  return (
    <div
      style={{
        position: "relative",
        width: w + bezel * 2,
        height: height + bezel * 2,
        borderRadius: radius + bezel,
        background: "#0E0E0E",
        padding: bezel,
        boxShadow: "0 50px 100px rgba(17,17,17,0.18), 0 18px 36px rgba(17,17,17,0.12), inset 0 0 0 2px #2A2A2A",
        ...style,
      }}
    >
      <div style={{ position: "relative", width: w, height, borderRadius: radius, overflow: "hidden", background: screenBg }}>
        {segments ? (
          <Series>
            {segments.map((sg, i) => (
              <Series.Sequence key={i} durationInFrames={Math.round(sg.dur * 30)}>
                <OffthreadVideo src={staticFile(sg.src ?? src)} startFrom={Math.round(sg.from * 30)} playbackRate={sg.rate ?? 1} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </Series.Sequence>
            ))}
          </Series>
        ) : video ? (
          <OffthreadVideo src={staticFile(src)} startFrom={startFrom} playbackRate={playbackRate} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `translateY(${(-shiftY / 1864) * height}px)` }} />
        )}
        {children}
      </div>
    </div>
  );
};
