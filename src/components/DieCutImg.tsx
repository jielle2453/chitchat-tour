"use client";
// An illustration tile cut into a real transparent die-cut sticker in the
// browser. Shows the original img (multiply) until the cut PNG is ready,
// then cross-fades. No mix-blend on the sticker itself — it has real alpha.
// Photo stickers (stickerDataUrl) already carry alpha + white border, so
// callers render those directly and only send illustrations here.
import { useEffect, useState } from "react";
import { dieCutSticker } from "@/lib/client/dieCut";

export default function DieCutImg({
  src,
  size,
  className = "",
  style,
}: {
  src: string;
  size: number; // display px (square)
  className?: string;
  style?: React.CSSProperties;
}) {
  const [done, setDone] = useState<Record<string, string>>({});
  const [dead, setDead] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (done[src] || dead[src]) return;
    let alive = true;
    dieCutSticker(src).then(
      (url) => {
        if (alive) setDone((s) => ({ ...s, [src]: url }));
      },
      () => {
        if (alive) setDead((s) => ({ ...s, [src]: true }));
      },
    );
    return () => {
      alive = false;
    };
  });
  const sticker = done[src] ?? null;
  return (
    <span className={`relative block ${className}`} style={{ width: size, height: size, ...style }}>
      {!dead[src] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          draggable={false}
          onError={() => setDead((s) => ({ ...s, [src]: true }))}
          className="absolute inset-0 h-full w-full object-contain mix-blend-multiply transition-opacity duration-300"
          style={{ opacity: sticker ? 0 : 1 }}
        />
      ) : null}
      {sticker ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={sticker} alt="" draggable={false} className="absolute inset-0 h-full w-full object-contain" />
      ) : null}
    </span>
  );
}
