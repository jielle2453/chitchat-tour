"use client";
// The finish card as a bottom sheet: the walked distance as cut-out collage
// stickers, one line about the stories, and two roomy buttons. A postmark
// slaps onto the top-right corner once the sheet has slid up.
import { useEffect, useState } from "react";
import { formatDistance, t } from "@/lib/client/i18n";
import type { Lang } from "@/lib/types";
import DieCutImg from "./DieCutImg";
import { playSfx } from "@/lib/client/sound";

const INK = "#3a3a3a";
const STICKER = 48;

function stampToday(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

// Arrival postmark, stamped onto the card: a double ink ring with the place
// name and today's date, three wavy cancellation bars running off right.
function Postmark({ name, delay }: { name: string; delay: number }) {
  const label = name.length > 14 ? `${name.slice(0, 14)}…` : name;
  return (
    <div
      aria-hidden
      className="rg-slap pointer-events-none absolute right-3 top-5"
      style={{ ["--rot" as string]: "-10deg", animationDelay: `${delay}s` }}
    >
      <svg width="150" height="96" viewBox="0 0 152 96" style={{ overflow: "visible", display: "block" }}>
        <g fill="none" stroke={INK} strokeOpacity="0.85">
          <circle cx="48" cy="48" r="45" strokeWidth="2.5" />
          <circle cx="48" cy="48" r="37" strokeWidth="1.25" />
          <path d="M 80 30 q 6 -4 12 0 t 12 0 t 12 0 t 12 0" strokeWidth="2" />
          <path d="M 80 48 q 6 -4 12 0 t 12 0 t 12 0 t 12 0" strokeWidth="2" />
          <path d="M 80 66 q 6 -4 12 0 t 12 0 t 12 0 t 12 0" strokeWidth="2" />
        </g>
        <text x="48" y="45" textAnchor="middle" fontSize="12" fontWeight="700" fill={INK} fillOpacity="0.85" textLength="62" lengthAdjust="spacingAndGlyphs">
          {label}
        </text>
        <text x="48" y="61" textAnchor="middle" fontSize="10" letterSpacing="1" fill={INK} fillOpacity="0.85">
          {stampToday()}
        </text>
      </svg>
    </div>
  );
}

function digitSrc(ch: string): string | null {
  if (ch >= "0" && ch <= "9") return `/start/digit-${ch}.webp`;
  if (ch === "m" || ch === "M") return "/start/digit-m.webp";
  return null;
}

// One cut-out collage character; plain bold text when its sticker is missing.
function Digit({ ch, index, at }: { ch: string; index: number; at: number }) {
  const src = digitSrc(ch);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!src) return;
    let alive = true;
    const img = new Image();
    img.onerror = () => {
      if (alive) setFailed(true);
    };
    img.src = src;
    return () => {
      alive = false;
    };
  }, [src]);
  const rot = ((index * 29 + ch.charCodeAt(0) * 7) % 15) - 7;
  return (
    <span aria-hidden className="rg-slap -mx-[3px]" style={{ ["--rot" as string]: `${rot}deg`, animationDelay: `${at + index * 0.07}s` }}>
      {src && !failed ? (
        <DieCutImg src={src} size={STICKER} />
      ) : (
        <span className="grid place-items-center text-[38px] font-bold leading-none" style={{ width: STICKER, height: STICKER }}>
          {ch}
        </span>
      )}
    </span>
  );
}

export default function ArrivalSheet({
  lang,
  distanceM,
  storyCount,
  destName,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
}: {
  lang: Lang;
  distanceM: number;
  storyCount: number;
  destName: string;
  primaryLabel: string;
  secondaryLabel: string;
  onPrimary: () => void;
  onSecondary: () => void;
}) {
  useEffect(() => playSfx("arrive"), []);
  const dist = formatDistance(distanceM);
  const chars = [...dist];
  const digitsAt = 0.3;
  return (
    <div
      role="status"
      className="rg-sheet-in absolute inset-x-0 bottom-0 z-40 rounded-t-card bg-surface pb-[max(32px,calc(env(safe-area-inset-bottom)+20px))] shadow-[0_-8px_28px_rgba(17,17,17,0.14)]"
    >
      <div aria-hidden className="flex w-full justify-center pb-1 pt-2">
        <span className="h-1 w-9 rounded-full bg-line" />
      </div>
      <div className="px-5 pt-3">
        <div role="img" aria-label={dist} className="flex items-center pl-1">
          {chars.map((ch, i) =>
            ch === " " ? <span key={i} aria-hidden className="w-2.5" /> : <Digit key={i} ch={ch} index={i} at={digitsAt} />,
          )}
        </div>
        <p className="mt-2 pr-36 text-[15px] font-medium">{t(lang, storyCount === 1 ? "navArrivedLineOne" : "navArrivedLine", { n: storyCount, name: destName })}</p>
        <div className="mt-5 flex flex-col gap-3">
          <button
            type="button"
            onClick={onPrimary}
            className="h-12 w-full rounded-full bg-ink px-4 text-[15px] font-medium text-white"
          >
            {primaryLabel}
          </button>
          <button
            type="button"
            onClick={onSecondary}
            className="h-12 w-full rounded-full border border-[rgba(17,17,17,0.12)] bg-white px-4 text-[15px] font-medium text-ink"
          >
            {secondaryLabel}
          </button>
        </div>
      </div>
      <Postmark name={destName} delay={digitsAt + chars.length * 0.07 + 0.15} />
    </div>
  );
}
