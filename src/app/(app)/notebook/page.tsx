"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import RouteSketch from "@/components/RouteSketch";
import StickerArt from "@/components/StickerArt";
import { formatDistance, t } from "@/lib/client/i18n";
import { areaLabel } from "@/lib/geo";
import { formatDay, groupByDay, newestFirst, type DayEntry } from "@/lib/client/notebook";
import { useDiscoveries, useProfile, useWalks } from "@/lib/client/storage";
import type { Lang } from "@/lib/types";

function DayCard({ day, lang }: { day: DayEntry; lang: Lang }) {
  const shown = day.discoveries.slice(-7);
  const meta = [areaLabel(day.areaName, lang), day.distanceM > 0 ? formatDistance(day.distanceM) : null].filter(Boolean).join(" · ");
  return (
    <Link href={`/notebook/day?date=${day.date}`} className="block space-y-3 rounded-card bg-surface p-4 ring-1 ring-line">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold">{formatDay(day.date, lang)}</p>
          <p className="truncate text-sm text-sub">{meta || " "}</p>
        </div>
        {day.paths.length ? (
          <div className="shrink-0 rounded-2xl bg-bg">
            <RouteSketch paths={day.paths} width={88} height={60} />
          </div>
        ) : null}
      </div>
      <div className="flex items-center pl-1" aria-label={t(lang, "stickers")}>
        {shown.map((d, i) => (
          <span key={d.id} className="-ml-2 first:ml-0" style={{ zIndex: i }}>
            <StickerArt discovery={d} size={48} rotate={i % 2 ? 5 : -5} />
          </span>
        ))}
      </div>
    </Link>
  );
}

export default function NotebookPage() {
  const { profile } = useProfile();
  const lang = profile.lang;
  const discoveries = useDiscoveries();
  const walks = useWalks();
  const [view, setView] = useState<"day" | "all">("day");
  const days = useMemo(() => groupByDay(discoveries, walks), [discoveries, walks]);
  const all = useMemo(() => newestFirst(discoveries), [discoveries]);

  return (
    <div className="rg-scroll h-full space-y-4 px-4 pb-8 pt-[max(20px,env(safe-area-inset-top))]">
      <h1 className="px-1 text-[28px] font-bold">{t(lang, "nbTitle")}</h1>
      {discoveries.length === 0 ? (
        <div className="flex flex-col items-center gap-4 pt-16 text-center">
          {/* slot for a sticker illustration */}
          <div aria-hidden className="grid h-24 w-24 -rotate-6 place-items-center rounded-[26px] border-[6px] border-white bg-accent text-5xl font-extrabold shadow-[0_0_0_2px_#111]">
            ?
          </div>
          <h2 className="text-xl font-bold">{t(lang, "nbEmptyTitle")}</h2>
          <p className="max-w-[16rem] text-base text-sub">{t(lang, "nbEmptyBody")}</p>
          <Link href="/" className="mt-2 inline-flex h-12 items-center rounded-full bg-ink px-6 font-semibold text-white">
            {t(lang, "nbEmptyGo")}
          </Link>
        </div>
      ) : (
        <>
          <div role="group" className="flex w-fit rounded-full bg-surface p-1 ring-1 ring-line">
            {(["day", "all"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={`h-10 rounded-full px-5 text-sm font-semibold ${view === v ? "bg-ink text-white" : "text-sub"}`}
              >
                {t(lang, v === "day" ? "byDay" : "all")}
              </button>
            ))}
          </div>
          {view === "day" ? (
            <div className="space-y-3">
              {days.map((d) => (
                <DayCard key={d.date} day={d} lang={lang} />
              ))}
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-3">
              {all.map((d) => (
                <li key={d.id}>
                  <Link href={`/notebook/item?id=${encodeURIComponent(d.id)}`} className="flex h-full flex-col items-center gap-3 rounded-card bg-surface p-4 text-center ring-1 ring-line">
                    <StickerArt discovery={d} size={92} rotate={-3} />
                    <span className="line-clamp-2 text-sm font-semibold leading-snug">{d.narration.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
