"use client";
// The walk as an unfolded hand-drawn collage sheet: the route fits the
// central 46% of the sheet, each discovery's sticker lives in the left/right
// margins with a dashed leader back to the route point where it was met,
// masking tape on top, a paper label strip below, and monochrome
// decorations (postmark stamp, north arrow, scale bar, walk number).
// On open the route draws itself (CSS stroke-dashoffset transition) and each
// sticker pops in exactly when the line reaches it (CSS animation-delay from
// the arc-length fraction — no requestAnimationFrame, which is throttled in
// some webviews). Blend note: stickers use mix-blend-multiply against the
// paper sheet, so no ancestor of an <img> may create a stacking context —
// sticker anchors are static (left/top/width only) and rotation + pop motion
// live on the img itself via StickerArt's popDelayMs.
import { RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import DieCutImg from "../DieCutImg";
import StickerArt from "../StickerArt";
import Stamp from "./Stamp";
import Tape from "./Tape";
import { t } from "@/lib/client/i18n";
import {
  clipStreets,
  collageDurationMs,
  fitMeterFrame,
  fractionsAlongRoute,
  jitterPoints,
  layoutCollageStickers,
  meterFrame,
  toPathD,
  walkBbox,
  type StreetGeom,
} from "@/lib/client/handDrawn";
import type { Discovery, Lang, WalkRecord } from "@/lib/types";

const W = 380; // sheet viewBox width; stickers/labels positioned in % so the sheet scales
const STICKER = 92;
const BAND_X0 = W * 0.27; // route lives in the central 46%
const BAND_X1 = W * 0.73;
const TOP_PAD = 78; // stamp zone: stickers stay below the postmark
const BOTTOM_PAD = 72; // footer zone: 24px breathing room + scale bar / N / No.
const LABEL_H = 34;
const SERIF = "Georgia, 'Songti TC', 'PMingLiU', 'Noto Serif TC', serif";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

// Estimated label-strip width at 11px type: CJK glyphs are full-em wide.
function estimateLabelWidth(title: string): number {
  let w = 16; // side padding + slack
  for (const ch of title) w += ch.charCodeAt(0) > 0xff ? 11 : 6;
  return Math.min(120, w);
}

// Horizontal nudge (sheet px) keeping the sticker-centred label ≥8px inside
// the sheet. The sticker itself never moves — only the strip shifts.
function labelShift(title: string, cx: number): number {
  const half = estimateLabelWidth(title) / 2;
  return Math.min(W - 8 - half - cx, Math.max(8 + half - cx, 0));
}

function stampDate(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export default function WalkMap({
  walk,
  discoveries,
  streets,
  lang,
  walkNumber,
}: {
  walk: WalkRecord;
  discoveries: Discovery[]; // oldest first
  streets: StreetGeom[];
  lang: Lang;
  walkNumber?: number; // 1-based index of the walk, shown as "No. 0007"
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replay, setReplay] = useState(0);
  const routeRef = useRef<SVGPathElement>(null);
  const ghostRef = useRef<SVGPathElement>(null);

  const layout = useMemo(() => {
    const path = walk.path.length >= 2 ? walk.path : ([[25.0338, 121.5299], [25.0339, 121.53]] as [number, number][]);
    const bbox = walkBbox(path);
    const m = meterFrame(bbox);
    const bandW = BAND_X1 - BAND_X0;
    // Height follows the route's own aspect first ...
    const Hroute = Math.min(1040, Math.max(320, Math.ceil((m.sy * bandW) / m.sx) + TOP_PAD + BOTTOM_PAD));
    const bandRect = { x: BAND_X0, y: TOP_PAD, w: bandW, h: Hroute - TOP_PAD - BOTTOM_PAD };
    const { scale, project } = fitMeterFrame(m, bandRect);

    const base = path.map(([lat, lon]) => project(lat, lon));
    const routePts = jitterPoints(base, `route:${walk.id}`, 1.6);
    const ghostPts = jitterPoints(base, `route:${walk.id}:ghost`, 2.3);
    const streetLines = clipStreets(streets, bbox, 30).map((s) => {
      const pts = jitterPoints(
        s.coordinates.map(([lon, lat]) => project(lat, lon)),
        `street:${s.id}`,
        2.4,
      );
      return { id: s.id, name: s.name, d: toPathD(pts), pts };
    });
    // Street name labels: longest lines only, laid along the street.
    const labels = [...streetLines]
      .sort((a, b) => b.pts.length - a.pts.length)
      .slice(0, 6)
      .map((s) => {
        const mid = s.pts[Math.floor(s.pts.length / 2)];
        const before = s.pts[Math.max(0, Math.floor(s.pts.length / 2) - 2)];
        const after = s.pts[Math.min(s.pts.length - 1, Math.floor(s.pts.length / 2) + 2)];
        let angle = (Math.atan2(after[1] - before[1], after[0] - before[0]) * 180) / Math.PI;
        if (angle > 90) angle -= 180;
        if (angle < -90) angle += 180;
        return { x: mid[0], y: mid[1], angle, name: s.name };
      });
    const withGeo = discoveries.filter((d) => typeof d.lat === "number" && typeof d.lon === "number");
    const fracs = fractionsAlongRoute(
      path,
      withGeo.map((d) => ({ lat: d.lat as number, lon: d.lon as number })),
    );
    const anchors = withGeo.map((d) => {
      const [rx, ry] = project(d.lat as number, d.lon as number);
      return { id: d.id, rx, ry };
    });
    const place = (h: number) =>
      layoutCollageStickers(anchors, {
        size: STICKER,
        w: W,
        h,
        bandX0: BAND_X0,
        bandX1: BAND_X1,
        topPad: TOP_PAD,
        bottomPad: BOTTOM_PAD,
        labelH: LABEL_H,
        gap: 10,
        edgeGap: 8,
        routePts,
      });
    // ... then the sheet grows just enough to hold route + stickers + footer.
    const routeBottom = Math.max(...routePts.map((p) => p[1]));
    const first = place(Hroute);
    const stickerBottom = first.length ? Math.max(...first.map((s) => s.y + STICKER + LABEL_H)) : -Infinity;
    const H = Math.min(1040, Math.max(Hroute, Math.ceil(Math.max(routeBottom, stickerBottom) + BOTTOM_PAD)));
    const stickers = (H > Hroute ? place(H) : first).map((s, i) => ({ ...s, frac: fracs[i] ?? 0, discovery: withGeo[i] }));
    return {
      H,
      scale,
      routeD: toPathD(routePts),
      ghostD: toPathD(ghostPts),
      start: routePts[0],
      end: routePts[routePts.length - 1],
      streetLines,
      labels,
      stickers,
    };
  }, [walk, discoveries, streets]);

  const D = collageDurationMs(layout.stickers.length);

  // Route draw via a CSS transition (not rAF). Stickers/leaders animate purely
  // in CSS from their arc-length delays, so this effect only handles the ink.
  useEffect(() => {
    const els = [routeRef.current, ghostRef.current];
    if (els.some((el) => !el)) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    try {
      for (const el of els) {
        const len = el!.getTotalLength();
        if (reduce || len === 0) {
          el!.style.transition = "none";
          el!.style.strokeDasharray = "none";
          el!.style.strokeDashoffset = "0";
          continue;
        }
        el!.style.transition = "none";
        el!.style.strokeDasharray = `${len}`;
        el!.style.strokeDashoffset = `${len}`;
        void el!.getBoundingClientRect(); // reflow so the transition below runs
        el!.style.transition = `stroke-dashoffset ${D}ms linear`;
        el!.style.strokeDashoffset = "0";
      }
    } catch {
      for (const el of els) {
        if (el) {
          el.style.transition = "none";
          el.style.strokeDasharray = "none";
          el.style.strokeDashoffset = "0";
        }
      }
    }
  }, [layout, replay, D]);

  const selected = selectedId ? (discoveries.find((d) => d.id === selectedId) ?? null) : null;
  const barLen = Math.max(14, 100 * layout.scale); // 100 m in sheet px
  // Start/end labels: outer side of each marker; when the markers sit within
  // 40px (loop walks) stack one above and one below instead.
  const endsClose =
    Math.hypot(layout.start[0] - layout.end[0], layout.start[1] - layout.end[1]) < 40;
  const outerSide = (p: [number, number]): { x: number; y: number; anchor: "start" | "middle" | "end" } =>
    p[0] < W / 2
      ? { x: Math.max(4, p[0] - 11), y: p[1] + 3.5, anchor: "end" }
      : { x: Math.min(W - 4, p[0] + 11), y: p[1] + 3.5, anchor: "start" };
  const startLabel: { x: number; y: number; anchor: "start" | "middle" | "end" } = endsClose
    ? { x: Math.min(W - 36, Math.max(36, layout.start[0])), y: layout.start[1] - 13, anchor: "middle" }
    : outerSide(layout.start);
  const endLabel: { x: number; y: number; anchor: "start" | "middle" | "end" } = endsClose
    ? { x: Math.min(W - 36, Math.max(36, layout.end[0])), y: layout.end[1] + 21, anchor: "middle" }
    : outerSide(layout.end);

  return (
    <div>
      <style>{RGC_CSS}</style>
      {/* Sheet: full-bleed width, paper colour, content-derived height */}
      <div
        className="relative w-full overflow-hidden"
        style={{
          background: "#FBFAF7",
          borderRadius: 20,
          boxShadow: "0 1px 2px rgba(17,17,17,0.05), 0 12px 32px rgba(17,17,17,0.08)",
          aspectRatio: `${W} / ${layout.H}`,
        }}
      >
        {/* key remounts the whole animated scene for Replay */}
        <div key={`${walk.id}:${replay}`} className="absolute inset-0">
          <svg viewBox={`0 0 ${W} ${layout.H}`} className="block h-full w-full" role="img" aria-label={walk.id}>
            {/* streets: thin wobbly ink */}
            <g stroke="rgba(17,17,17,0.22)" strokeWidth={0.9} fill="none" strokeLinecap="round">
              {layout.streetLines.map((s) => (
                <path key={s.id} d={s.d} />
              ))}
            </g>
            <g fontSize={9} fontWeight={400} fill="rgba(17,17,17,0.40)">
              {layout.labels.map((l, i) => (
                <text key={i} x={l.x} y={l.y - 3} textAnchor="middle" transform={`rotate(${l.angle.toFixed(1)} ${l.x} ${l.y})`}>
                  {l.name}
                </text>
              ))}
            </g>
            {/* route: hand-drawn ink — main stroke plus a fainter offset twin */}
            <path
              ref={ghostRef}
              d={layout.ghostD}
              fill="none"
              stroke="#1a1a1a"
              strokeOpacity={0.35}
              strokeWidth={1}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="rgc-route"
            />
            <path
              ref={routeRef}
              d={layout.routeD}
              fill="none"
              stroke="#1a1a1a"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="rgc-route"
            />
            {/* leader lines: dashed, drawn 200 ms just before their sticker pops */}
            {layout.stickers.map((s) => {
              const len = Math.hypot(s.lx - s.rx, s.ly - s.ry);
              if (len < 2) return null;
              return (
                <g key={`leader:${s.id}`}>
                  <line
                    x1={s.rx}
                    y1={s.ry}
                    x2={s.lx}
                    y2={s.ly}
                    stroke="rgba(17,17,17,0.35)"
                    strokeWidth={0.8}
                    strokeDasharray="2 3"
                    className="rgc-anim"
                    style={{
                      animation: "rgc-fade 200ms ease-out backwards",
                      animationDelay: `${Math.max(0, s.frac * D - 200)}ms`,
                    }}
                  />
                  <circle
                    cx={s.rx}
                    cy={s.ry}
                    r={3}
                    fill="#1a1a1a"
                    className="rgc-anim"
                    style={{ animation: "rgc-fade 200ms ease-out backwards", animationDelay: `${s.frac * D}ms` }}
                  />
                </g>
              );
            })}
            {/* start dot + end ring, single-language labels on the outer side */}
            <circle cx={layout.start[0]} cy={layout.start[1]} r={5} fill="#1a1a1a" />
            <circle cx={layout.end[0]} cy={layout.end[1]} r={8} fill="none" stroke="#1a1a1a" strokeWidth={2} />
            <circle cx={layout.end[0]} cy={layout.end[1]} r={2.4} fill="#1a1a1a" />
            <text
              x={startLabel.x}
              y={startLabel.y}
              textAnchor={startLabel.anchor}
              fontSize={10}
              fontWeight={500}
              fontStyle="italic"
              fill="#1a1a1a"
              style={{ fontFamily: SERIF }}
            >
              {t(lang, "nbStartMark")}
            </text>
            <text
              x={endLabel.x}
              y={endLabel.y}
              textAnchor={endLabel.anchor}
              fontSize={10}
              fontWeight={500}
              fontStyle="italic"
              fill="#1a1a1a"
              style={{ fontFamily: SERIF }}
            >
              {t(lang, "nbEndMark")}
            </text>
            {/* scale bar + north arrow + walk number: monochrome corners */}
            <g stroke="#1a1a1a" strokeWidth={1} opacity={0.7}>
              <line x1={16} y1={layout.H - 22} x2={16 + barLen} y2={layout.H - 22} />
              <line x1={16} y1={layout.H - 25} x2={16} y2={layout.H - 19} />
              <line x1={16 + barLen} y1={layout.H - 25} x2={16 + barLen} y2={layout.H - 19} />
            </g>
            <text x={16} y={layout.H - 30} fontSize={9} fill="rgba(17,17,17,0.7)" style={{ fontFamily: SERIF }}>
              100 m
            </text>
            <g opacity={0.7}>
              <text x={W - 24} y={layout.H - 44} textAnchor="middle" fontSize={22} fontStyle="italic" fill="#1a1a1a" style={{ fontFamily: SERIF }}>
                N
              </text>
              <g stroke="#1a1a1a" strokeWidth={1.2} strokeLinecap="round">
                <line x1={W - 24} y1={layout.H - 40} x2={W - 24} y2={layout.H - 26} />
                <line x1={W - 24} y1={layout.H - 40} x2={W - 27.5} y2={layout.H - 33} />
                <line x1={W - 24} y1={layout.H - 40} x2={W - 20.5} y2={layout.H - 33} />
              </g>
            </g>
            {typeof walkNumber === "number" ? (
              <text x={W - 14} y={layout.H - 12} textAnchor="end" fontSize={9} fill="rgba(17,17,17,0.55)" fontFamily="monospace">
                No. {String(walkNumber).padStart(4, "0")}
              </text>
            ) : null}
          </svg>

          {/* stickers in the margins: static anchors, motion lives on the art */}
          {layout.stickers.map((s) => (
            <div
              key={s.id}
              className="absolute"
              style={{ left: `${(s.x / W) * 100}%`, top: `${(s.y / layout.H) * 100}%`, width: `${(STICKER / W) * 100}%` }}
            >
              <button
                type="button"
                onClick={() => setSelectedId(s.id)}
                aria-label={s.discovery.narration.title}
                className="relative block w-full cursor-pointer"
                style={{ aspectRatio: "1" }}
              >
                {s.discovery.stickerDataUrl || !s.discovery.narration.itemId ? (
                  <StickerArt
                    discovery={s.discovery}
                    size={STICKER}
                    rotate={s.rot}
                    popDelayMs={s.frac * D}
                    className="aspect-square !h-auto !w-full"
                  />
                ) : (
                  // Browser die-cut sticker (real alpha, no multiply needed),
                  // popping on this wrapper so the art itself stays blend-free.
                  <span
                    className="rgc-anim block aspect-square w-full"
                    style={
                      {
                        "--rot": `${s.rot}deg`,
                        transform: `rotate(${s.rot}deg)`,
                        animation: "rgc-pop 420ms cubic-bezier(.2,.9,.2,1.2) backwards",
                        animationDelay: `${s.frac * D}ms`,
                      } as CSSProperties
                    }
                  >
                    <DieCutImg
                      src={`/illustrations/${encodeURIComponent(s.discovery.narration.itemId)}.webp`}
                      size={STICKER}
                      style={{ width: "100%", height: "100%" }}
                    />
                  </span>
                )}
                {s.discovery.stickerDataUrl ? null : <Tape rotate={s.tapeRot} />}
              </button>
              <div
                className="rgc-anim pointer-events-none absolute"
                style={{
                  top: "calc(100% + 5px)",
                  left: `calc(50% + ${(labelShift(s.discovery.narration.title, s.x + STICKER / 2) / STICKER) * 100}%)`,
                  width: "max-content",
                  maxWidth: 120,
                  transform: "translateX(-50%)",
                  animation: "rgc-fade 300ms ease-out backwards",
                  animationDelay: `${s.frac * D}ms`,
                }}
              >
                <span
                  style={{
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    background: "#fff",
                    border: "1px solid rgba(17,17,17,0.08)",
                    boxShadow: "0 1px 1px rgba(17,17,17,0.06)",
                    transform: `rotate(${s.labelRot.toFixed(2)}deg)`,
                    padding: "3px 7px",
                    fontSize: 11,
                    fontWeight: 500,
                    color: "#1a1a1a",
                    lineHeight: 1.35,
                    textAlign: "center",
                  }}
                >
                  {s.discovery.narration.title}
                </span>
              </div>
            </div>
          ))}

          {/* postmark stamp, top-left */}
          <div className="absolute" style={{ left: 12, top: 10 }}>
            <Stamp date={stampDate(walk.startedAt)} />
          </div>

          {/* replay pill, top-right */}
          <button
            type="button"
            onClick={() => {
              setSelectedId(null);
              setReplay((r) => r + 1);
            }}
            className="rgc-anim absolute inline-flex h-8 items-center gap-1.5 rounded-full px-3"
            style={{
              right: 12,
              top: 12,
              fontSize: 13,
              fontWeight: 500,
              color: "#1a1a1a",
              background: "rgba(255,255,255,0.72)",
              backdropFilter: "blur(8px)",
              border: "1px solid rgba(17,17,17,0.1)",
              boxShadow: "0 1px 2px rgba(17,17,17,0.08)",
            }}
          >
            <RotateCcw size={14} aria-hidden />
            {t(lang, "nbReplay")}
          </button>
        </div>
      </div>

      {/* tapped sticker: newspaper clipping as a bottom sheet */}
      {selected ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={selected.narration.title}>
          <button
            type="button"
            aria-label={t(lang, "close")}
            onClick={() => setSelectedId(null)}
            className="absolute inset-0"
            style={{ background: "rgba(0,0,0,0.35)", animation: "rgc-fade 200ms ease-out" }}
          />
          <div
            className="relative w-full"
            style={{
              maxWidth: 480,
              padding: "0 12px max(24px, env(safe-area-inset-bottom))",
              animation: "rgc-sheet-up 280ms cubic-bezier(0.2,0.8,0.2,1)",
            }}
          >
            <article
              aria-label={selected.narration.title}
              className="border-y-2 border-dashed border-neutral-300 bg-white px-4 py-3.5 ring-1 ring-line"
              style={{ borderRadius: 12, transform: "rotate(-1deg)", boxShadow: "0 12px 32px rgba(0,0,0,0.18)" }}
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-[19px] font-semibold leading-snug" style={{ fontFamily: SERIF }}>
                  {selected.narration.title}
                </h2>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  aria-label={t(lang, "close")}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-sub ring-1 ring-line"
                >
                  <X size={14} aria-hidden />
                </button>
              </div>
              {selected.narration.contrast ? (
                <p className="mt-1 text-[13px] leading-relaxed text-sub">
                  {t(lang, "here")}: {selected.narration.contrast.here} · {t(lang, "elsewhere")}: {selected.narration.contrast.elsewhere}
                </p>
              ) : null}
              <p className="mt-1.5 text-[14px] leading-relaxed">{selected.narration.text}</p>
              <div className="mt-2.5 flex items-center justify-between gap-3">
                <span className="text-[13px] text-sub">
                  {t(lang, "sources")} · {selected.narration.sources.length}
                </span>
                <Link
                  href={`/notebook/item?id=${encodeURIComponent(selected.id)}`}
                  className="inline-flex h-9 items-center rounded-full bg-ink px-4 text-[13px] font-medium text-white"
                >
                  {t(lang, "nbOpenNote")}
                </Link>
              </div>
            </article>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// Collage keyframes, scoped to this sheet by class names. Base state is the
// final state; animations use fill-backwards so elements sit hidden only
// during their delay, and prefers-reduced-motion snaps to the final state.
const RGC_CSS = `
@keyframes rgc-pop {
  0% { opacity: 0; transform: rotate(var(--rot, 0deg)) scale(0.6); }
  60% { opacity: 1; transform: rotate(var(--rot, 0deg)) scale(1.06); }
  100% { opacity: 1; transform: rotate(var(--rot, 0deg)) scale(1); }
}
@keyframes rgc-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes rgc-sheet-up {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .rgc-anim, .rgc-route { animation: none !important; transition: none !important; }
}
`;
