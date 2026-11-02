"use client";
// A walk as a ticket stub: date on the left, perforation, title + compact
// meta + sticker glimpses, route glyph on the right. Proportional numerals
// everywhere (tabular-nums, never monospace). Links to the walk detail page.
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useState, type CSSProperties } from "react";
import DieCutImg from "../DieCutImg";
import { formatDistance, t } from "@/lib/client/i18n";
import { formatDurationShort, formatTicketDate, ticketStubParts, walkDurationMin, walkPlaceParts } from "@/lib/client/notebookData";
import { projectPath, samplePath, type LatLon } from "@/lib/client/walkPath";
import type { Discovery, Lang, WalkRecord } from "@/lib/types";
import { useNowTick } from "./useNow";

const INK = "#111111";
const INK_55 = "rgba(17,17,17,0.55)";
const PERF = "rgba(17,17,17,0.18)";
const THUMB_ROT = [-6, 5, -3, 6];

function thumbSrc(d: Pick<Discovery, "stickerDataUrl" | "narration">): { src: string; photo: boolean } | null {
  if (d.stickerDataUrl) return { src: d.stickerDataUrl, photo: true };
  const itemId = d.narration.itemId;
  if (!itemId || itemId.startsWith("live:")) return null;
  return { src: `/illustrations/${encodeURIComponent(itemId)}.webp`, photo: false };
}

function Thumb({ art, index }: { art: { src: string; photo: boolean }; index: number }) {
  const [failed, setFailed] = useState(false);
  const style: CSSProperties =
    index === 0
      ? { transform: `rotate(${THUMB_ROT[index % THUMB_ROT.length]}deg)` }
      : { marginLeft: -4, transform: `rotate(${THUMB_ROT[index % THUMB_ROT.length]}deg)` };
  if (art.photo) {
    if (failed) return null;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={art.src}
        alt=""
        draggable={false}
        width={32}
        height={32}
        onError={() => setFailed(true)}
        className="h-[32px] w-[32px] object-contain"
        style={style}
      />
    );
  }
  return <DieCutImg src={art.src} size={32} style={style} />;
}

function RouteGlyph({ path }: { path: [number, number][] }) {
  const pts = projectPath(samplePath(path as LatLon[], 160), 40, 40, 8);
  if (pts.length < 2 || pts.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) return null;
  const first = pts[0];
  const last = pts[pts.length - 1];
  return (
    <svg width={40} height={40} viewBox="0 0 40 40" aria-hidden>
      <polyline
        points={pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}
        fill="none"
        stroke={INK}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={first[0]} cy={first[1]} r={3} fill={INK} />
      <circle cx={last[0]} cy={last[1]} r={3} fill="none" stroke={INK} strokeWidth={1.75} />
      <circle cx={last[0]} cy={last[1]} r={1} fill={INK} />
    </svg>
  );
}

export default function TicketCard({
  walk,
  count,
  lang,
  stickers = [],
}: {
  walk: WalkRecord;
  count: number;
  lang: Lang;
  stickers?: Discovery[];
}) {
  const now = useNowTick();
  const mins = walkDurationMin(walk, walk.endedAt ?? now);
  const stub = ticketStubParts(walk.startedAt, lang);
  const { area, dest } = walkPlaceParts(walk, lang);
  const title = area ?? (dest || t(lang, "unknownArea"));
  const thumbs = stickers
    .map((d) => ({ d, art: thumbSrc(d) }))
    .filter((x): x is { d: Discovery; art: { src: string; photo: boolean } } => x.art !== null)
    .slice(0, 4);
  return (
    <Link
      href={`/notebook/walk?id=${encodeURIComponent(walk.id)}`}
      className="relative block min-h-[112px] rounded-[20px] bg-white"
      style={{
        border: "1px solid rgba(17,17,17,0.06)",
        boxShadow: "0 1px 2px rgba(17,17,17,0.04), 0 8px 24px rgba(17,17,17,0.05)",
      }}
      aria-label={`${title}, ${formatTicketDate(walk.startedAt, lang)}`}
    >
      {/* punched notches centered on the top / bottom edges at x=76 */}
      <span aria-hidden className="absolute z-10 h-[14px] w-[14px] rounded-full bg-bg" style={{ left: 69, top: -7 }} />
      <span aria-hidden className="absolute z-10 h-[14px] w-[14px] rounded-full bg-bg" style={{ left: 69, bottom: -7 }} />
      {/* perforation: 1px dashed line (dash 3, gap 4) at x=76 */}
      <span
        aria-hidden
        className="absolute inset-y-0"
        style={{
          left: 76,
          width: 1,
          backgroundImage: `linear-gradient(to bottom, ${PERF} 3px, transparent 3px)`,
          backgroundSize: "1px 7px",
          backgroundRepeat: "repeat-y",
        }}
      />
      <div className="flex items-stretch">
        <div className="flex w-[76px] shrink-0 flex-col items-center justify-center py-3">
          <span className="text-[11px] font-medium" style={{ color: INK_55 }}>
            {stub.weekday}
          </span>
          <span className="text-[30px] font-semibold tabular-nums" style={{ lineHeight: 1.05, fontVariantNumeric: "tabular-nums" }}>
            {stub.day}
          </span>
          <span className="text-[11px] font-medium" style={{ color: INK_55 }}>
            {stub.month}
          </span>
        </div>
        <div className="min-w-0 flex-1 py-4 pl-[18px] pr-2">
          <p className="flex items-center gap-1 truncate text-[16px] font-semibold leading-snug">
            <span className="truncate">{title}</span>
            {dest && area ? <ArrowRight size={14} aria-hidden className="shrink-0" /> : null}
            {dest && area ? <span className="truncate">{dest}</span> : null}
          </p>
          <p className="mt-0.5 truncate text-[13px] font-medium tabular-nums" style={{ color: INK_55 }}>
            {formatDistance(walk.distanceM)} · {formatDurationShort(mins, lang)} · {t(lang, "nbMetCount", { n: count })}
          </p>
          {thumbs.length > 0 ? (
            <div className="mt-2 flex h-[32px] items-center" aria-hidden>
              {thumbs.map(({ d, art }, i) => (
                <Thumb key={d.id} art={art} index={i} />
              ))}
            </div>
          ) : null}
        </div>
        {walk.path.length > 1 ? (
          <div className="grid shrink-0 place-items-center py-4 pl-0 pr-4" aria-hidden>
            <div className="grid h-14 w-14 place-items-center rounded-[14px]" style={{ background: "rgba(17,17,17,0.035)" }}>
              <RouteGlyph path={walk.path} />
            </div>
          </div>
        ) : null}
      </div>
    </Link>
  );
}
