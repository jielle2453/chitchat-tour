"use client";
// A theme as ONE rounded-square glass card that IS the container: stickers
// pile inside it (pre-settled before first paint in the grid), and tapping it
// opens a large glass sheet where stickers drop in, collide, and can be
// dragged/flung. Rendering: absolutely positioned art updated via
// requestAnimationFrame refs (never React state per frame). Stickers are real
// links (keyboard works); a plain small list sits below so physics never
// traps anyone.
import { Building2, Bus, Coffee, Signpost, Smartphone, Star, Store, X, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import DieCutImg from "../DieCutImg";
import { t } from "@/lib/client/i18n";
import { themeName, type ThemeKey } from "@/lib/client/notebookData";
import { createJarWorld, JAR_DT, JAR_GRAVITY, setJarGravity, settleJar, stepJar, wakeJar, type JarWorld } from "@/lib/client/physics";
import type { Discovery, Lang, Narration } from "@/lib/types";

const GLASS: CSSProperties = {
  background: "linear-gradient(160deg, rgba(255,255,255,0.92), rgba(255,255,255,0.55))",
  backdropFilter: "blur(18px) saturate(1.4)",
  WebkitBackdropFilter: "blur(18px) saturate(1.4)",
  border: "1px solid rgba(255,255,255,0.9)",
  boxShadow:
    "inset 0 1px 0 rgba(255,255,255,1), inset 0 -6px 16px rgba(17,17,17,0.025), 0 1px 2px rgba(17,17,17,0.05), 0 10px 28px rgba(17,17,17,0.08)",
};

const INK_55 = "rgba(17,17,17,0.55)";

const GRID_SIZE = 72; // px stickers in the grid for 5+ items
const GRID_CORNER = 28; // card radius
const GRID_MAX = 6;
const SHEET_SIZE = 96; // px stickers in the sheet
const SHEET_R = 40; // ≈ 0.42 × size
const SHEET_CORNER = 32; // sheet radius

const ICONS: Record<NonNullable<Narration["category"]>, LucideIcon> = {
  street: Signpost,
  transport: Bus,
  shop: Store,
  architecture: Building2,
  "daily-life": Coffee,
  other: Star,
};

function artSrc(d: Pick<Discovery, "stickerDataUrl" | "narration">): string | null {
  if (d.stickerDataUrl) return d.stickerDataUrl;
  const itemId = d.narration.itemId;
  return itemId && !itemId.startsWith("live:") ? `/illustrations/${encodeURIComponent(itemId)}.webp` : null;
}

// Photo stickers already carry alpha + white border: render as-is.
// Illustrations are cut into real die-cut stickers in the browser.
function StickerArt({ discovery, size }: { discovery: Discovery; size: number }) {
  if (discovery.stickerDataUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={discovery.stickerDataUrl}
        alt=""
        draggable={false}
        style={{
          width: size,
          height: size,
          objectFit: "contain",
          filter: "drop-shadow(0 5px 9px rgba(0,0,0,0.28))",
        }}
      />
    );
  }
  const src = artSrc(discovery);
  if (src) return <DieCutImg src={src} size={size} />;
  const Icon = ICONS[discovery.narration.category ?? "other"] ?? Star;
  return (
    <span className="grid place-items-center bg-neutral-200" style={{ width: size, height: size, borderRadius: size * 0.22 }}>
      <Icon size={Math.round(size * 0.42)} strokeWidth={1.5} className="text-neutral-500" />
    </span>
  );
}

// Diagonal highlight streak clipped to the card.
function GlassStreak({ radius }: { radius: number }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        borderRadius: radius,
        opacity: 0.35,
        background: "linear-gradient(20deg, rgba(255,255,255,0) 30%, rgba(255,255,255,0.9) 45%, rgba(255,255,255,0) 70%)",
      }}
    />
  );
}

// One sticker inside the sheet. The anchor never moves (blend-safe); the art
// carries its own translate+rotate transform, updated imperatively.
function SheetSticker({
  discovery,
  size,
  imgRef,
  onPointerDown,
  onClickCapture,
}: {
  discovery: Discovery;
  size: number;
  imgRef: (el: HTMLElement | null) => void;
  onPointerDown: (e: React.PointerEvent, id: string) => void;
  onClickCapture: (e: React.MouseEvent) => void;
}) {
  const focusRing = (on: boolean) => (e: React.FocusEvent) => {
    (e.target as HTMLElement).style.outline = on ? "3px solid var(--ink)" : "";
    (e.target as HTMLElement).style.outlineOffset = on ? "2px" : "";
  };
  return (
    <a
      href={`/notebook/item?id=${encodeURIComponent(discovery.id)}`}
      aria-label={discovery.narration.title}
      onPointerDown={(e) => onPointerDown(e, discovery.id)}
      onClickCapture={onClickCapture}
      onFocus={focusRing(true)}
      onBlur={focusRing(false)}
      className="absolute left-0 top-0 block touch-none overflow-visible outline-none"
      style={{ width: 0, height: 0 }}
    >
      <span ref={imgRef as (el: HTMLSpanElement | null) => void} className="block">
        <StickerArt discovery={discovery} size={size} />
      </span>
    </a>
  );
}

interface DragState {
  id: string;
  x: number;
  y: number;
  moved: number;
  lastT: number;
}

function ThemeCell({
  theme,
  items,
  lang,
  onToggle,
}: {
  theme: ThemeKey;
  items: Discovery[];
  lang: Lang;
  onToggle: () => void;
}) {
  const name = themeName(lang, theme);
  const cardRef = useRef<HTMLButtonElement>(null);
  const [size, setSize] = useState(0);
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const measure = () => setSize(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Sparse themes get bigger stickers so the card doesn't look empty.
  const stickerSize = items.length <= 2 ? 96 : items.length <= 4 ? 80 : GRID_SIZE;
  const pile = useMemo(() => {
    if (size <= 0) return null;
    const r = Math.round(stickerSize * 0.42);
    // header reserve at the top, 12px breathing room at the bottom
    const areaH = size - 72 - 12;
    if (areaH <= r * 2) return null;
    const w = size - 16;
    const world = createJarWorld(w, areaH, items.slice(0, GRID_MAX).map((d) => d.id), r, GRID_CORNER);
    settleJar(world, 400);
    return world;
  }, [size, items, stickerSize]);

  const byId = useMemo(() => new Map(items.map((d) => [d.id, d])), [items]);

  return (
    <button
      ref={cardRef}
      type="button"
      onClick={onToggle}
      aria-expanded={false}
      aria-label={`${name}, ${t(lang, "nbMetCount", { n: items.length })}`}
      className="relative block aspect-square w-full overflow-hidden rounded-[28px] text-left"
      style={GLASS}
    >
      <GlassStreak radius={28} />
      <span className="absolute left-0 top-0 z-10 block p-[14px]">
        <span className="block truncate text-[15px] font-semibold leading-snug">{name}</span>
        <span className="block text-[12px] font-medium tabular-nums" style={{ color: INK_55 }}>
          {t(lang, "nbMetCount", { n: items.length })}
        </span>
      </span>
      {pile ? (
        <span aria-hidden className="absolute block" style={{ left: 8, bottom: 12, width: pile.w, height: pile.h }}>
          {pile.bodies.map((b) => {
            const d = byId.get(b.id);
            if (!d) return null;
            return (
              <span
                key={b.id}
                className="absolute left-0 top-0 block"
                style={{ transform: `translate(${(b.x - stickerSize / 2).toFixed(1)}px, ${(b.y + b.r - stickerSize).toFixed(1)}px) rotate(${b.rot.toFixed(1)}deg)` }}
              >
                <StickerArt discovery={d} size={stickerSize} />
              </span>
            );
          })}
        </span>
      ) : null}
    </button>
  );
}

function ThemeSheet({
  theme,
  items,
  lang,
  onToggle,
}: {
  theme: ThemeKey;
  items: Discovery[];
  lang: Lang;
  onToggle: () => void;
}) {
  const name = themeName(lang, theme);
  const sheetRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<JarWorld | null>(null);
  const imgEls = useRef(new Map<string, HTMLElement>());
  const dragRef = useRef<DragState | null>(null);
  const draggedAway = useRef(false);
  const ctlRef = useRef<{ kick: () => void } | null>(null);
  const [tiltOn, setTiltOn] = useState(false);
  const [area, setArea] = useState({ w: 0, h: 0 });
  const [boxW, setBoxW] = useState(() => (typeof window !== "undefined" ? window.innerWidth - 32 : 360));

  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    const measure = () => setBoxW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Size the play area itself to its pile; the sheet wraps it. The physics
  // world is built from the measured box, so its floor is the visible floor.
  const sheetCount = Math.min(items.length, 40);
  const sheetPerRow = Math.max(1, Math.floor(boxW / SHEET_SIZE));
  const playH = Math.min(
    typeof window !== "undefined" ? window.innerHeight * 0.6 : 500,
    Math.max(200, Math.ceil(sheetCount / sheetPerRow) * SHEET_SIZE * 0.95 + 40),
  );

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const measure = () => setArea({ w: Math.max(200, el.clientWidth), h: Math.max(120, el.clientHeight) });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // One rAF chain per expansion: fixed-timestep accumulator, stops sleeping.
  useEffect(() => {
    if (area.w <= 0 || area.h <= 0) return;
    // Bodies are circles of SHEET_R but the art is a SHEET_SIZE square: lift the
    // floor by the difference so the bottom row isn't clipped.
    const floorPad = Math.max(0, SHEET_SIZE / 2 - SHEET_R) + 4;
    const world = createJarWorld(area.w, area.h - floorPad, items.slice(0, 40).map((d) => d.id), SHEET_R, SHEET_CORNER, 140);
    worldRef.current = world;
    const reduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const paint = () => {
      for (const b of world.bodies) {
        const el = imgEls.current.get(b.id);
        if (el) el.style.transform = `translate(${(b.x - b.r).toFixed(1)}px, ${(b.y - b.r).toFixed(1)}px) rotate(${b.rot.toFixed(1)}deg)`;
      }
    };
    if (reduced) {
      settleJar(world, 600);
      paint();
      return;
    }
    let raf = 0;
    let alive = true;
    let active = false;
    let last = 0;
    let acc = 0;
    const tick = (now: number) => {
      if (!alive) return;
      acc = Math.min(0.1, acc + (now - last) / 1000);
      last = now;
      let n = 0;
      while (acc >= JAR_DT && n < 6) {
        stepJar(world);
        acc -= JAR_DT;
        n++;
      }
      // a dragged sticker stays pinned; holding still zeroes its velocity
      const drag = dragRef.current;
      if (drag) {
        const b = world.bodies.find((x) => x.id === drag.id);
        if (b) {
          b.x = Math.min(world.w - b.r, Math.max(b.r, drag.x));
          b.y = Math.min(world.h - b.r, Math.max(-world.h, drag.y));
          if (now - drag.lastT > 90) {
            b.vx = 0;
            b.vy = 0;
          }
        }
      }
      paint();
      active = !world.settled || dragRef.current !== null;
      if (active) raf = requestAnimationFrame(tick);
    };
    ctlRef.current = {
      kick: () => {
        wakeJar(world);
        if (!active) {
          active = true;
          last = performance.now();
          acc = 0;
          raf = requestAnimationFrame(tick);
        }
      },
    };
    active = true;
    last = performance.now();
    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ctlRef.current = null;
    };
  }, [area.w, area.h, items]);

  // Phone tilt shifts gravity. iOS needs a permission tap — the tilt button is it.
  useEffect(() => {
    if (!tiltOn) return;
    const onOri = (e: DeviceOrientationEvent) => {
      const world = worldRef.current;
      if (!world || e.gamma == null || e.beta == null) return;
      const gx = Math.max(-1, Math.min(1, e.gamma / 30)) * JAR_GRAVITY;
      const gy = Math.max(220, Math.min(JAR_GRAVITY, ((e.beta - 55) / 30) * JAR_GRAVITY + JAR_GRAVITY * 0.35));
      setJarGravity(world, gx, gy);
      ctlRef.current?.kick();
    };
    window.addEventListener("deviceorientation", onOri);
    return () => window.removeEventListener("deviceorientation", onOri);
  }, [tiltOn]);

  async function enableTilt() {
    if (tiltOn) {
      setTiltOn(false);
      return;
    }
    try {
      const DOE = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> } | undefined;
      if (DOE && typeof DOE.requestPermission === "function") {
        if ((await DOE.requestPermission()) !== "granted") return;
      }
    } catch {
      // non-iOS: no permission step, just listen
    }
    setTiltOn(true);
  }

  function areaPoint(e: React.PointerEvent): { x: number; y: number } {
    const rect = areaRef.current?.getBoundingClientRect();
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
  }

  function handlePointerDown(e: React.PointerEvent, id: string) {
    const p = areaPoint(e);
    dragRef.current = { id, x: p.x, y: p.y, moved: 0, lastT: performance.now() };
    draggedAway.current = false;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    const world = worldRef.current;
    if (!drag || !world) return;
    const p = areaPoint(e);
    const now = performance.now();
    const dt = Math.max(1, now - drag.lastT) / 1000;
    // fling velocity from the pointer, smoothed and clamped
    const b = world.bodies.find((x) => x.id === drag.id);
    if (b) {
      b.vx = Math.max(-2200, Math.min(2200, 0.6 * b.vx + 0.4 * ((p.x - drag.x) / dt)));
      b.vy = Math.max(-2200, Math.min(2200, 0.6 * b.vy + 0.4 * ((p.y - drag.y) / dt)));
    }
    drag.moved += Math.hypot(p.x - drag.x, p.y - drag.y);
    drag.x = p.x;
    drag.y = p.y;
    drag.lastT = now;
    if (drag.moved > 10) {
      draggedAway.current = true;
      ctlRef.current?.kick();
    }
  }

  function handlePointerUp() {
    dragRef.current = null;
  }

  function handleClickCapture(e: React.MouseEvent) {
    if (draggedAway.current) {
      e.preventDefault();
      e.stopPropagation();
      draggedAway.current = false;
    }
  }

  const size = SHEET_SIZE;
  return (
    <div ref={sheetRef} className="relative flex w-full flex-col overflow-hidden rounded-[32px] p-4" style={GLASS}>
      <GlassStreak radius={32} />
      <div className="relative z-10 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-[16px] font-semibold">{name}</span>
          <span className="shrink-0 text-[12px] font-medium tabular-nums" style={{ color: INK_55 }}>
            {t(lang, "nbMetCount", { n: items.length })}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={enableTilt}
            aria-pressed={tiltOn}
            title={t(lang, "nbTiltAllow")}
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium"
            style={{
              background: "rgba(255,255,255,0.6)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.9)",
              color: INK_55,
            }}
          >
            <Smartphone size={14} aria-hidden />
            {t(lang, "nbTilt")}
          </button>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={true}
            aria-label={t(lang, "close")}
            className="grid h-9 w-9 place-items-center rounded-full"
            style={{
              background: "rgba(255,255,255,0.6)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.9)",
              color: INK_55,
            }}
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      </div>
      <p className="relative z-10 px-1 pb-2 pt-1 text-[12px]" style={{ color: "rgba(17,17,17,0.45)" }}>
        {t(lang, "nbSheetHint")}
      </p>
      <div
        ref={areaRef}
        role="group"
        aria-label={`${name} — ${t(lang, "nbSheetHint")}`}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="relative w-full shrink-0 overflow-hidden"
        style={{ height: playH }}
      >
        {items.slice(0, 40).map((d) => (
          <SheetSticker
            key={d.id}
            discovery={d}
            size={size}
            imgRef={(el) => {
              if (el) imgEls.current.set(d.id, el);
              else imgEls.current.delete(d.id);
            }}
            onPointerDown={handlePointerDown}
            onClickCapture={handleClickCapture}
          />
        ))}
      </div>
      <details className="relative z-10 px-1 pt-1 text-[13px]">
        <summary className="cursor-pointer font-medium" style={{ color: INK_55 }}>
          {t(lang, "nbJarList")}
        </summary>
        <ul className="space-y-1 py-2">
          {items.map((d) => (
            <li key={d.id}>
              <a href={`/notebook/item?id=${encodeURIComponent(d.id)}`} className="underline decoration-line underline-offset-2">
                {d.narration.title}
              </a>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

export default function ThemeJar({
  theme,
  items,
  lang,
  expanded,
  onToggle,
}: {
  theme: ThemeKey;
  items: Discovery[]; // oldest first
  lang: Lang;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (!expanded) return <ThemeCell theme={theme} items={items} lang={lang} onToggle={onToggle} />;
  return <ThemeSheet theme={theme} items={items} lang={lang} onToggle={onToggle} />;
}
