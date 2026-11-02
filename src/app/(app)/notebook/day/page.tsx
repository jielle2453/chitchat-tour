"use client";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, type CSSProperties } from "react";
import RouteSketch from "@/components/RouteSketch";
import StickerArt from "@/components/StickerArt";
import { formatDistance, t } from "@/lib/client/i18n";
import { areaLabel } from "@/lib/geo";
import { formatDay, groupByDay } from "@/lib/client/notebook";
import { scatterLayout } from "@/lib/client/scatter";
import { useDiscoveries, useProfile, useWalks } from "@/lib/client/storage";

const BOARD_W = 360;
const PAD = 12; // breathing room above and below the stickers

function DayPage() {
  const date = useSearchParams().get("date") ?? "";
  const { profile } = useProfile();
  const lang = profile.lang;
  const discoveries = useDiscoveries();
  const walks = useWalks();
  const day = useMemo(() => groupByDay(discoveries, walks).find((d) => d.date === date) ?? null, [discoveries, walks, date]);
  const layout = useMemo(() => scatterLayout(day?.discoveries.map((d) => d.id) ?? [], BOARD_W), [day]);
  const byId = new Map((day?.discoveries ?? []).map((d) => [d.id, d]));
  const boardH = layout.height + PAD * 2;
  const meta = day ? [areaLabel(day.areaName, lang), day.distanceM > 0 ? formatDistance(day.distanceM) : null].filter(Boolean).join(" · ") : "";

  return (
    <div className="rg-scroll h-full space-y-4 px-4 pb-8 pt-[max(12px,env(safe-area-inset-top))]">
      <header className="flex items-center gap-3">
        <Link href="/notebook" aria-label={t(lang, "back")} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface ring-1 ring-line">
          <ArrowLeft size={20} aria-hidden />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">{formatDay(date, lang)}</h1>
          {meta ? <p className="truncate text-sm text-sub">{meta}</p> : null}
        </div>
      </header>

      {!day ? (
        <p className="pt-10 text-center text-sub">{t(lang, "nbNotFound")}</p>
      ) : (
        <div className="relative w-full overflow-hidden rounded-card bg-[#FBFAF6] ring-1 ring-line" style={{ aspectRatio: `${layout.width} / ${boardH}` }}>
          {day.paths.length ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <RouteSketch paths={day.paths} width={layout.width} height={layout.height} stroke="#C9C4B2" strokeWidth={3} dashed margin={36} />
            </div>
          ) : null}
          {layout.items.map((p, i) => {
            const d = byId.get(p.id);
            if (!d) return null;
            const style = {
              left: `${((p.x - p.size / 2) / layout.width) * 100}%`,
              top: `${((p.y - p.size / 2 + PAD) / boardH) * 100}%`,
              width: `${(p.size / layout.width) * 100}%`,
              animationDelay: `${i * 60}ms`,
              "--rot": "0deg",
            } as CSSProperties;
            return (
              <Link key={p.id} href={`/notebook/item?id=${encodeURIComponent(d.id)}`} className="rg-pop absolute block" style={style}>
                <div className="relative" style={{ transform: `rotate(${p.rot}deg)` }}>
                  <StickerArt discovery={d} size={p.size} rotate={0} className="!h-auto !w-full aspect-square" />
                  <span
                    className="absolute -bottom-1 left-1/2 max-w-[110%] truncate whitespace-nowrap rounded-[4px] border border-[#E2DBC5] bg-[#FFFDF5] px-2 py-0.5 text-[11px] font-semibold shadow-[0_1px_2px_rgba(17,17,17,0.15)]"
                    style={{ transform: `translateX(-50%) rotate(${-p.rot * 0.6 + 2}deg)` }}
                  >
                    {d.narration.title}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <DayPage />
    </Suspense>
  );
}
