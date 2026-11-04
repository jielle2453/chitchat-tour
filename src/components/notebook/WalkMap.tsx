"use client";
// The walk as one quiet, editorial page: the place name in a large serif, a
// neat row of date / distance / time, then a thin ink route over faint named
// streets. Stickers stand upright in two columns outside the route, each with
// its short name on a white clipping centred underneath; a dot on the route
// marks where it was heard. One screen, no scrolling. On open the route draws itself (CSS
// stroke-dashoffset transition) and each sticker fades in as the line reaches
// it. Tapping a sticker opens its story page. Blend note:
// motion lives on the art itself, so no ancestor of a mix-blend-multiply img
// gets a transform/filter/opacity.
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import DieCutImg from "../DieCutImg";
import StickerArt from "../StickerArt";
import { useNowTick } from "./useNow";
import { formatDistance, t } from "@/lib/client/i18n";
import { playSfx } from "@/lib/client/sound";
import {
  clipStreets,
  collageDurationMs,
  fitMeterFrame,
  fractionsAlongRoute,
  meterFrame,
  toPathD,
  walkBbox,
  type StreetGeom,
} from "@/lib/client/handDrawn";
import { formatDurationShort, walkDurationMin, walkPlaceParts } from "@/lib/client/notebookData";
import type { Discovery, Lang, WalkRecord } from "@/lib/types";

const SANS = `"Noto Sans TC", "Noto Sans JP", system-ui, -apple-system, "Segoe UI", "Hiragino Sans", "PingFang TC", "Microsoft JhengHei", sans-serif`;
const INK = "#1c1b19";
// Header type: plain ink on the page, hairline rules.
const ON_DARK = INK;
const ON_DARK_SUB = "rgba(28,27,25,0.5)";
const ON_DARK_HAIR = "rgba(28,27,25,0.14)";
const M = 24; // page margin

const CAP_PX = 11;
const CAP_LH = 14;
const CJK_RE = /[぀-ヿ㐀-䶿一-鿿豈-﫿]/;

let mCanvas: HTMLCanvasElement | null = null;
let mCtx: CanvasRenderingContext2D | null | undefined;

// Canvas measureText; a char estimate on the server or without a 2d context.
function textWidth(text: string, font: string, px: number): number {
  if (typeof document !== "undefined") {
    try {
      if (!mCanvas) mCanvas = document.createElement("canvas");
      if (mCtx === undefined) mCtx = mCanvas.getContext("2d");
      if (mCtx) {
        mCtx.font = font;
        return mCtx.measureText(text).width;
      }
    } catch {
      // fall through
    }
  }
  let w = 0;
  for (const ch of text) w += ch === " " ? px * 0.28 : ch.charCodeAt(0) > 0xff ? px : px * 0.55;
  return w;
}

// Wrap into at most two lines of maxW; the second ends with "…" when cut.
function wrap2(text: string, maxW: number, font: string, px: number): string[] {
  const cjk = CJK_RE.test(text);
  const units = cjk ? [...text] : text.split(/\s+/).filter(Boolean);
  const join = (a: string, b: string) => (a === "" ? b : cjk ? a + b : `${a} ${b}`);
  const w = (s: string) => textWidth(s, font, px);
  const lines: string[] = [];
  let cur = "";
  let i = 0;
  for (; i < units.length; i++) {
    const trial = join(cur, units[i]);
    if (cur === "" || w(trial) <= maxW) cur = trial;
    else {
      lines.push(cur);
      cur = units[i];
      if (lines.length === 2) break;
    }
  }
  if (lines.length < 2 && cur) lines.push(cur);
  if (i < units.length && lines.length === 2) {
    let last = lines[1];
    while (last.length > 1 && w(`${last}…`) > maxW) last = cjk ? last.slice(0, -1) : last.split(" ").slice(0, -1).join(" ") || last.slice(0, -1);
    lines[1] = `${last}…`;
  }
  return lines.slice(0, 2);
}

// "November 4" / "11月4日": the date without the weekday.
function monthDay(ms: number, lang: Lang): string {
  try {
    return new Date(ms).toLocaleDateString(lang, { month: "long", day: "numeric" });
  } catch {
    return new Date(ms).toLocaleDateString("en", { month: "long", day: "numeric" });
  }
}

interface KbThing {
  id: string;
  trigger?: { photo_concepts?: string[] };
}

// A sticker's note names the thing: the knowledge item's short English
// concept ("garbage truck"), or the first few characters of a CJK title.
// English names for what each story sticker photo shows (several stories
// share one knowledge-base concept, e.g. five are "garbage truck").
const STICKER_LABEL: Record<string, string> = {
  "garbage-truck-why-music": "garbage truck",
  "garbage-truck-japan-origin": "1960s truck",
  "garbage-truck-maidens-prayer": "music box",
  "garbage-truck-1984-tune-swap": "trophy",
  "garbage-truck-local-tunes": "cassette player",
  "taipei-pay-as-you-throw": "official trash bag",
  "few-public-trash-cans": "street trash can",
  "household-trash-in-public-bins-fine": "stuffed trash can",
  "convenience-store-density": "convenience store",
  "convenience-store-area-density": "two stores",
  "convenience-store-bill-payment": "payment kiosk",
  "convenience-store-tax-payment": "tax slip",
  "mrt-no-eating": "no food or drink",
  "mrt-fare-gate-yellow-line": "fare gate",
  "pedestrian-flashing-green-rule": "green man",
  "pedestrian-green-man-run-animation": "running green man",
  "two-stage-left-turn-origin": "scooter",
  "two-stage-left-turn-tainan": "left-turn scooter",
  "motorcycles-out-of-arcades": "parked scooter",
  "youbike-origin": "YouBike",
  "youbike-free-30-min": "YouBike",
  "manhole-covers-art": "painted manhole",
  "manhole-anti-slip": "manhole cover",
  "overhead-power-lines": "utility pole",
  "arcade-qilou-origin": "shophouse arcade",
  "arcade-is-road": "arcade pillars",
  "iron-window-bars": "iron window grille",
  "rooftop-water-tank": "water tank",
  "breakfast-hot-food": "soy milk",
  "joss-paper-burners": "joss paper furnace",
  "ghost-month-offerings": "offerings",
};

function shortThing(d: Discovery, lang: Lang, things: Record<string, string>): string {
  const title = d.narration.title.trim();
  if (lang === "en") {
    const id = d.narration.itemId;
    const c = id ? (STICKER_LABEL[id] ?? things[id]) : undefined;
    if (c) return c;
    return title.split(/[:—,]/)[0].split(/\s+/).slice(0, 3).join(" ");
  }
  const first = title.split(/[：:—，、,]/)[0];
  return first.length > 8 ? first.slice(0, 8) : first;
}

interface Placed {
  id: string;
  cx: number;
  cy: number;
  size: number;
  frac: number;
  discovery: Discovery;
  anchor: [number, number] | null;
  side: "left" | "right";
  caption: string[];
}

export default function WalkMap({
  walk,
  discoveries,
  unplaced,
  streets = [],
  lang,
  replayKey = 0,
}: {
  walk: WalkRecord;
  discoveries: Discovery[]; // oldest first, includes unplaced ones
  unplaced: Discovery[]; // discoveries without lat/lon: they join a column, no hairline
  streets?: StreetGeom[];
  lang: Lang;
  replayKey?: number; // bump to re-play the draw + fade animation
}) {
  const pageRef = useRef<HTMLDivElement>(null);
  const routeRef = useRef<SVGPathElement>(null);
  const [pagePx, setPagePx] = useState<{ w: number; h: number } | null>(null);
  const [things, setThings] = useState<Record<string, string>>({});
  const now = useNowTick();
  const mins = walkDurationMin(walk, now);

  useEffect(() => {
    const el = pageRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setPagePx({ w: Math.max(1, Math.round(r.width)), h: Math.max(1, Math.round(r.height)) });
    });
    ro.observe(el);
    let alive = true;
    void import("@data/knowledge/taipei.json").then((m) => {
      const raw = m.default as unknown as { items?: KbThing[] } | KbThing[];
      const list = Array.isArray(raw) ? raw : (raw.items ?? []);
      const map: Record<string, string> = {};
      for (const it of list) {
        const c = it.trigger?.photo_concepts?.[0];
        if (c) map[it.id] = c;
      }
      if (alive) setThings(map);
    });
    return () => {
      alive = false;
      ro.disconnect();
    };
  }, []);

  const layout = useMemo(() => {
    if (!pagePx) return null;
    const W = pagePx.w;
    const H = pagePx.h;

    // ---- header: name, destination, a neat stats row between hairlines
    const { area, dest } = walkPlaceParts(walk, lang);
    const name = (area ?? dest ?? t(lang, "unknownArea")).trim();
    const nameMax = W - M * 2;
    const namePx = Math.max(22, Math.min(30, Math.floor((30 * nameMax) / Math.max(1, textWidth(name, `700 30px ${SANS}`, 30)))));
    const destLine = dest && area ? `→ ${dest}` : null;
    const nameTop = 18;
    const destTop = nameTop + namePx * 1.15 + 2;
    const rule1 = (destLine ? destTop + 22 : nameTop + namePx * 1.15) + 12;
    const statsTop = rule1 + 12;
    const rule2 = statsTop + 40;
    const stats = [
      { label: t(lang, "nbStatDate"), value: monthDay(walk.startedAt, lang) },
      { label: t(lang, "nbStatDistance"), value: formatDistance(walk.distanceM) },
      { label: t(lang, "nbStatTime"), value: formatDurationShort(mins, lang) },
    ];
    const headerBottom = rule2;

    // ---- route in the central band; stickers get the two outer columns
    const path = walk.path.length >= 2 ? walk.path : ([[25.0338, 121.5299], [25.0339, 121.53]] as [number, number][]);
    const colW = Math.round(Math.min(104, W * 0.25));
    const bandX0 = M + colW - 4;
    const bandX1 = W - M - colW + 4;
    const top = headerBottom + 26;
    const bottom = H - 18;
    const { project } = fitMeterFrame(meterFrame(walkBbox(path, 0)), { x: bandX0, y: top, w: Math.max(40, bandX1 - bandX0), h: Math.max(60, bottom - top) });
    const routePts = path.map(([lat, lon]) => project(lat, lon));

    // Streets reach well past the route; names sit on their visible stretch.
    const rb = walkBbox(path, 0);
    const half = Math.max(rb.maxLat - rb.minLat, rb.maxLon - rb.minLon) * 0.9 + 0.001;
    const cLat = (rb.minLat + rb.maxLat) / 2;
    const cLon = (rb.minLon + rb.maxLon) / 2;
    const streetBox = { minLat: cLat - half, maxLat: cLat + half, minLon: cLon - half * 1.2, maxLon: cLon + half * 1.2 };
    const streetLines = clipStreets(streets, streetBox, 90).map((s) => {
      const pts = s.coordinates.map(([lon, lat]) => project(lat, lon));
      return { id: s.id, name: s.name, pts, d: toPathD(pts) };
    });
    const onPage = ([x, y]: [number, number]) => x > bandX0 - 30 && x < bandX1 + 30 && y > headerBottom + 14 && y < H - 12;
    const seen = new Set<string>();
    const streetLabels = streetLines
      .filter((l) => l.name)
      .map((l) => ({ l, vis: l.pts.map((p, i) => (onPage(p) ? i : -1)).filter((i) => i >= 0) }))
      .filter(({ vis }) => vis.length >= 2)
      .sort((a, b) => b.vis.length - a.vis.length)
      .filter(({ l }) => (seen.has(l.name as string) ? false : (seen.add(l.name as string), true)))
      .slice(0, 5)
      .map(({ l, vis }) => {
        const k = vis[Math.floor(vis.length / 2)];
        const a = l.pts[Math.max(0, k - 1)];
        const b = l.pts[Math.min(l.pts.length - 1, k + 1)];
        let angle = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
        if (angle > 90) angle -= 180;
        if (angle < -90) angle += 180;
        return { x: l.pts[k][0], y: l.pts[k][1], angle, name: l.name as string };
      });

    // ---- stickers: left or right column by where they were heard
    const withGeo = discoveries.filter((d) => typeof d.lat === "number" && typeof d.lon === "number");
    const fracs = fractionsAlongRoute(
      path,
      withGeo.map((d) => ({ lat: d.lat as number, lon: d.lon as number })),
    );
    const midX = (bandX0 + bandX1) / 2;
    type Item = { d: Discovery; anchor: [number, number] | null; frac: number; side: "left" | "right" };
    const items: Item[] = withGeo.map((d, i) => {
      const a = project(d.lat as number, d.lon as number);
      return { d, anchor: a, frac: fracs[i] ?? 0, side: a[0] < midX ? "left" : "right" };
    });
    // Balance the columns: move the most central ones across when one side is fuller.
    const count = (s: "left" | "right") => items.filter((it) => it.side === s).length;
    while (Math.abs(count("left") - count("right")) > 1) {
      const from = count("left") > count("right") ? "left" : "right";
      const cand = items.filter((it) => it.side === from && it.anchor).sort((a, b) => Math.abs(a.anchor![0] - midX) - Math.abs(b.anchor![0] - midX))[0];
      if (!cand) break;
      cand.side = from === "left" ? "right" : "left";
    }
    for (const d of unplaced) items.push({ d, anchor: null, frac: 1, side: count("left") <= count("right") ? "left" : "right" });

    const perSide = Math.max(count("left"), count("right"), 1);
    const capH = (CAP_LH + 2) * 2 + 2;
    const slot = (bottom - top) / perSide;
    const size = Math.round(Math.max(40, Math.min(72, slot - capH - 14)));
    const step = size + capH + 14;
    const capFont = `500 ${CAP_PX + 1}px ${SANS}`;

    const placed: Placed[] = [];
    for (const side of ["left", "right"] as const) {
      const col = items.filter((it) => it.side === side).sort((a, b) => (a.anchor?.[1] ?? Infinity) - (b.anchor?.[1] ?? Infinity));
      const cx = side === "left" ? M + colW / 2 : W - M - colW / 2;
      const ys = col.map((it) => (it.anchor ? it.anchor[1] : bottom));
      // forward pass keeps a full step between neighbours, backward pass keeps the column on the page
      for (let i = 0; i < ys.length; i++) ys[i] = Math.max(ys[i], i === 0 ? top + size / 2 : ys[i - 1] + step);
      for (let i = ys.length - 1; i >= 0; i--) ys[i] = Math.min(ys[i], i === ys.length - 1 ? bottom - capH - size / 2 : ys[i + 1] - step);
      col.forEach((it, i) => {
        placed.push({
          id: it.d.id,
          cx,
          cy: Math.max(top + size / 2, ys[i]),
          size,
          frac: it.frac,
          discovery: it.d,
          anchor: it.anchor,
          side,
          caption: wrap2(shortThing(it.d, lang, things), colW - 16, capFont, CAP_PX + 1),
        });
      });
    }

    return {
      W,
      H,
      name,
      namePx,
      nameTop,
      destLine,
      destTop,
      rule1,
      rule2,
      statsTop,
      stats,
      colW,
      routeD: toPathD(routePts),
      start: routePts[0],
      end: routePts[routePts.length - 1],
      streetLines,
      streetLabels,
      placed,
    };
  }, [walk, discoveries, unplaced, streets, lang, pagePx, things, mins]);

  const D = layout ? collageDurationMs(layout.placed.length) : 2500;

  // Route draw via a CSS transition (not rAF).
  useEffect(() => {
    const el = routeRef.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    try {
      const len = el.getTotalLength();
      el.style.transition = "none";
      if (reduce || len === 0) {
        el.style.strokeDasharray = "none";
        el.style.strokeDashoffset = "0";
        return;
      }
      el.style.strokeDasharray = `${len}`;
      el.style.strokeDashoffset = `${len}`;
      void el.getBoundingClientRect();
      el.style.transition = `stroke-dashoffset ${D}ms linear`;
      el.style.strokeDashoffset = "0";
    } catch {
      el.style.strokeDasharray = "none";
      el.style.strokeDashoffset = "0";
    }
  }, [layout, replayKey, D]);

  // a soft pop as each sticker lands, in step with its fade-in
  useEffect(() => {
    if (!layout || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timers = layout.placed.map((p) => setTimeout(() => playSfx("pop"), p.frac * D + 60));
    return () => timers.forEach(clearTimeout);
  }, [layout, replayKey, D]);

  return (
    <div className="relative h-full w-full">
      <style>{RGC_CSS}</style>
      <div ref={pageRef} className="absolute inset-0 overflow-hidden">
        {layout ? (
          <div key={`${walk.id}:${replayKey}`} className="absolute inset-0">
            {/* header */}
            <h1
              className="absolute whitespace-nowrap"
              style={{ left: M, top: layout.nameTop, fontFamily: SANS, fontSize: layout.namePx, fontWeight: 700, lineHeight: 1.15, color: ON_DARK, letterSpacing: "-0.01em" }}
            >
              {layout.name}
            </h1>
            {layout.destLine ? (
              <p className="absolute whitespace-nowrap" style={{ left: M, top: layout.destTop, fontFamily: SANS, fontSize: 15, fontWeight: 500, lineHeight: "22px", color: ON_DARK_SUB }}>
                {layout.destLine}
              </p>
            ) : null}
            <div className="absolute" style={{ left: M, right: M, top: layout.rule1, height: 1, background: ON_DARK_HAIR }} />
            <div className="absolute" style={{ left: M, right: M, top: layout.rule2, height: 1, background: ON_DARK_HAIR }} />
            <div className="absolute grid grid-cols-3" style={{ left: M, right: M, top: layout.statsTop }}>
              {layout.stats.map((s, i) => (
                <div key={s.label} className="min-w-0 text-center" style={{ borderLeft: i > 0 ? `1px solid ${ON_DARK_HAIR}` : undefined }}>
                  <div style={{ fontFamily: SANS, fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: ON_DARK_SUB, lineHeight: "12px" }}>
                    {s.label}
                  </div>
                  <div className="truncate tabular-nums" style={{ fontFamily: SANS, fontSize: 15, fontWeight: 500, color: ON_DARK, lineHeight: "22px", marginTop: 3 }}>
                    {s.value}
                  </div>
                </div>
              ))}
            </div>

            {/* map: faint named streets, a thin ink route, hairlines to the stickers */}
            <svg viewBox={`0 0 ${layout.W} ${layout.H}`} className="pointer-events-none absolute inset-0 block h-full w-full" role="img" aria-label={walk.id}>
              <defs>
                <clipPath id={`rgc-map-${walk.id}`}>
                  <rect x={0} y={layout.rule2 + 1} width={layout.W} height={layout.H} />
                </clipPath>
              </defs>
              <g clipPath={`url(#rgc-map-${walk.id})`}>
                <g stroke="rgba(28,27,25,0.12)" strokeWidth={0.8} fill="none" strokeLinecap="round">
                  {layout.streetLines.map((l) => (
                    <path key={l.id} d={l.d} />
                  ))}
                </g>
                <g fontSize={9} fill="rgba(28,27,25,0.34)" style={{ fontFamily: SANS }}>
                  {layout.streetLabels.map((l, i) => (
                    <text key={i} x={l.x} y={l.y - 4} textAnchor="middle" transform={`rotate(${l.angle.toFixed(1)} ${l.x} ${l.y})`}>
                      {l.name}
                    </text>
                  ))}
                </g>
                <path
                  ref={routeRef}
                  d={layout.routeD}
                  fill="none"
                  stroke={INK}
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="rgc-route"
                />
                {layout.placed
                  .filter((p) => p.anchor)
                  .map((p) => (
                    <circle
                      key={`pt:${p.id}`}
                      cx={p.anchor![0]}
                      cy={p.anchor![1]}
                      r={4}
                      fill={INK}
                      className="rgc-anim"
                      style={{ animation: "rgc-fade 300ms ease-out backwards", animationDelay: `${p.frac * D}ms` }}
                    />
                  ))}
                <circle cx={layout.start[0]} cy={layout.start[1]} r={4.5} fill="#f4f4f2" stroke={INK} strokeWidth={1.6} />
                <circle cx={layout.end[0]} cy={layout.end[1]} r={4.5} fill={INK} />
              </g>
            </svg>

            {/* stickers, upright, with their short names centred underneath */}
            {layout.placed.map((p) => (
              <div key={p.id} className="absolute" style={{ left: p.cx - layout.colW / 2, top: p.cy - p.size / 2, width: layout.colW }}>
                <Link
                  href={`/notebook/item?id=${encodeURIComponent(p.id)}`}
                  aria-label={p.discovery.narration.title}
                  className="relative mx-auto block"
                  style={{ width: p.size, height: p.size }}
                >
                  {p.discovery.stickerDataUrl || !p.discovery.narration.itemId ? (
                    <StickerArt discovery={p.discovery} size={p.size} rotate={0} popDelayMs={p.frac * D} className="rgc-sticker-shadow" />
                  ) : (
                    <span
                      className="rgc-anim block h-full w-full"
                      style={
                        {
                          "--rot": "0deg",
                          filter: "drop-shadow(0 2px 4px rgba(17,17,17,0.14))",
                          animation: "rgc-pop 420ms cubic-bezier(.2,.9,.2,1.1) backwards",
                          animationDelay: `${p.frac * D}ms`,
                        } as CSSProperties
                      }
                    >
                      <DieCutImg src={`/illustrations/${encodeURIComponent(p.discovery.narration.itemId)}.webp`} size={p.size} style={{ width: "100%", height: "100%" }} />
                    </span>
                  )}
                </Link>
                <div
                  className="rgc-anim pointer-events-none mx-auto mt-1.5 w-fit text-center"
                  style={{
                    fontFamily: SANS,
                    fontWeight: 500,
                    fontSize: CAP_PX + 1,
                    lineHeight: `${CAP_LH + 2}px`,
                    color: "#161616",
                    background: "#fff",
                    padding: "1px 7px",
                    boxShadow: "0 1px 1px rgba(17,17,17,0.08), 0 2px 5px rgba(17,17,17,0.08)",
                    animation: "rgc-fade 300ms ease-out backwards",
                    animationDelay: `${p.frac * D + 120}ms`,
                  }}
                >
                  {p.caption.map((l, i) => (
                    <div key={i} className="whitespace-nowrap">
                      {l}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

    </div>
  );
}

// Keyframes scoped by class names. Base state is the final state; animations
// use fill-backwards, and reduced motion snaps to the final state.
const RGC_CSS = `
.rgc-sticker-shadow {
  filter: drop-shadow(0 2px 4px rgba(17,17,17,0.14));
}
@keyframes rgc-pop {
  0% { opacity: 0; transform: rotate(var(--rot, 0deg)) scale(0.85); }
  100% { opacity: 1; transform: rotate(var(--rot, 0deg)) scale(1); }
}
@keyframes rgc-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .rgc-anim, .rgc-route { animation: none !important; transition: none !important; }
}
`;
