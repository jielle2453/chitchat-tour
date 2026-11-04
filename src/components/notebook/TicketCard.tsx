"use client";
// A walk as a ticket: the details on the left, a white stub printed sideways on the right (year, month, day between
// two heavy rules, then the place squeezed tall like a barcode), a perforated
// tear line with real cut-out notches, then from -> to on two lines, meta,
// sticker glimpses and the route glyph. Links to the walk detail page.
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useState, type CSSProperties } from "react";
import DieCutImg from "../DieCutImg";
import { formatDistance, t } from "@/lib/client/i18n";
import { formatDurationShort, formatTicketDate, walkDurationMin, walkPlaceParts } from "@/lib/client/notebookData";
import { projectPath, samplePath, type LatLon } from "@/lib/client/walkPath";
import type { Discovery, Lang, WalkRecord } from "@/lib/types";
import { useNowTick } from "./useNow";

const INK = "#111111";
const INK_55 = "rgba(17,17,17,0.55)";
const PERF = "rgba(17,17,17,0.28)";
const STUB_W = 84;
const STUB_H = 140;
const STUB_INK = "rgba(17,17,17,0.62)";
const STUB_SUB = "rgba(17,17,17,0.42)";
const STUB_RULE = "rgba(17,17,17,0.3)";
const STUB_PLACE = "rgba(17,17,17,0.34)";
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

// Coarse Taipei / Tainan city boxes; everything else in Taiwan is just "TAIWAN".
export function placeStamp(path: [number, number][]): string {
  const p = path[0];
  if (p && p[0] > 24.96 && p[0] < 25.21 && p[1] > 121.45 && p[1] < 121.67) return "TAIWAN TAIPEI";
  if (p && p[0] > 22.88 && p[0] < 23.1 && p[1] > 120.1 && p[1] < 120.3) return "TAIWAN TAINAN";
  return "TAIWAN";
}

// The stub artwork, drawn upright then turned to read bottom-to-top.
export function StubPrint({ at, place }: { at: number; place: string }) {
  const d = new Date(at);
  const L = STUB_H; // length along the stub once rotated
  return (
    <svg aria-hidden width={STUB_W} height={STUB_H} viewBox={`0 0 ${STUB_W} ${STUB_H}`} className="block">
      <g transform={`translate(0 ${STUB_H}) rotate(-90)`} fill={STUB_INK}>
        <line x1={12} y1={24} x2={34} y2={24} stroke={STUB_RULE} strokeWidth={1} />
        <text x={40} y={16} fontSize={8} fontWeight={400} letterSpacing={0.6} fill={STUB_SUB}>
          {d.getFullYear()}
        </text>
        <text x={40} y={29.5} fontSize={13.5} fontWeight={600} letterSpacing={1}>
          {MONTHS[d.getMonth()]}
        </text>
        <text x={78} y={30} fontSize={22} fontWeight={500}>
          {d.getDate()}
        </text>
        <line x1={d.getDate() > 9 ? 108 : 98} y1={24} x2={L - 12} y2={24} stroke={STUB_RULE} strokeWidth={1} />
        <text x={12} y={72} fontSize={38} fontWeight={600} textLength={L - 24} lengthAdjust="spacingAndGlyphs" fill={STUB_PLACE}>
          {place}
        </text>
      </g>
    </svg>
  );
}

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
  const pts = projectPath(samplePath(path as LatLon[], 160), 56, 56, 6);
  if (pts.length < 2 || pts.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) return null;
  const first = pts[0];
  const last = pts[pts.length - 1];
  return (
    <svg width={56} height={56} viewBox="0 0 56 56" aria-hidden>
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
  // The stub sits on the right: notches and perforation are measured from the right edge.
  const notch = (y: string) => `radial-gradient(circle at calc(100% - ${STUB_W}px) ${y}, transparent 10px, #000 10.5px)`;
  const { area, dest } = walkPlaceParts(walk, lang);
  const title = area ?? (dest || t(lang, "unknownArea"));
  const thumbs = stickers
    .map((d) => ({ d, art: thumbSrc(d) }))
    .filter((x): x is { d: Discovery; art: { src: string; photo: boolean } } => x.art !== null)
    .slice(0, 4);
  return (
    <div style={{ filter: "drop-shadow(0 0 0.6px rgba(17,17,17,0.22)) drop-shadow(0 6px 14px rgba(17,17,17,0.06))" }}>
    <Link
      href={`/notebook/walk?id=${encodeURIComponent(walk.id)}`}
      className="relative block overflow-hidden rounded-[14px] bg-white"
      style={{
        maskImage: `${notch("0")}, ${notch("100%")}`,
        maskComposite: "intersect",
        WebkitMaskImage: `${notch("0")}, ${notch("100%")}`,
        WebkitMaskComposite: "source-in",
      }}
      aria-label={`${title}${dest && area ? ` → ${dest}` : ""}, ${formatTicketDate(walk.startedAt, lang)}, ${t(lang, "nbMetCount", { n: count })}`}
    >
      {/* perforation along the tear line */}
      <span
        aria-hidden
        className="absolute inset-y-[14px]"
        style={{
          right: STUB_W,
          width: 1,
          backgroundImage: `linear-gradient(to bottom, ${PERF} 4px, transparent 4px)`,
          backgroundSize: "1px 8px",
          backgroundRepeat: "repeat-y",
        }}
      />
      <div className="relative flex items-stretch">
        <div className="min-w-0 flex-1 py-4 pl-[18px] pr-2">
          <p className="text-[16px] font-semibold leading-snug [overflow-wrap:anywhere]">{title}</p>
          {dest && area ? (
            <p className="flex items-start gap-1 text-[16px] font-semibold leading-snug [overflow-wrap:anywhere]">
              <ArrowRight size={14} aria-hidden className="mt-[5px] shrink-0" style={{ color: INK_55 }} />
              <span className="min-w-0">{dest}</span>
            </p>
          ) : null}
          <p className="mt-1 truncate text-[13px] font-medium tabular-nums" style={{ color: INK_55 }}>
            {formatDistance(walk.distanceM)} · {formatDurationShort(mins, lang)}
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
          <div className="flex shrink-0 items-center pr-4" aria-hidden>
            <RouteGlyph path={walk.path} />
          </div>
        ) : null}
        <div className="flex shrink-0 items-center" style={{ width: STUB_W, minHeight: STUB_H }}>
          <StubPrint at={walk.startedAt} place={placeStamp(walk.path)} />
        </div>
      </div>
    </Link>
    </div>
  );
}
