"use client";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import WalkMap from "@/components/notebook/WalkMap";
import StickerArt from "@/components/StickerArt";
import { useNowTick } from "@/components/notebook/useNow";
import { formatDistance, t } from "@/lib/client/i18n";
import { formatTicketDate, walkDurationMin, walkPlaceLabel } from "@/lib/client/notebookData";
import type { StreetGeom } from "@/lib/client/handDrawn";
import { useDiscoveries, useProfile, useWalks } from "@/lib/client/storage";
import type { Lang } from "@/lib/types";

// Compact duration for the header line: "32 分" / "1 小時 25 分".
function formatDurationShort(min: number, lang: Lang): string {
  if (min < 60) return t(lang, "nbMinShort", { n: min });
  return t(lang, "nbHourMinShort", { h: Math.floor(min / 60), m: min % 60 });
}

function WalkPage() {
  const id = useSearchParams().get("id") ?? "";
  const { profile } = useProfile();
  const lang = profile.lang;
  const walks = useWalks();
  const discoveries = useDiscoveries();
  const [streets, setStreets] = useState<StreetGeom[]>([]);

  const walk = useMemo(() => walks.find((w) => w.id === id) ?? null, [walks, id]);
  // 1-based walk number (oldest walk = No. 1) for the sheet's corner mark.
  const walkNumber = useMemo(() => {
    const i = [...walks].sort((a, b) => a.startedAt - b.startedAt).findIndex((w) => w.id === id);
    return i >= 0 ? i + 1 : undefined;
  }, [walks, id]);
  const now = useNowTick();
  const mins = walk ? walkDurationMin(walk, now) : 0;
  const items = useMemo(
    () => discoveries.filter((d) => d.walkId === id || walk?.discoveryIds.includes(d.id)).sort((a, b) => a.at - b.at),
    [discoveries, walk, id],
  );
  const unplaced = useMemo(() => items.filter((d) => typeof d.lat !== "number" || typeof d.lon !== "number"), [items]);

  // Street geometry is only needed for this sheet — load it on demand.
  useEffect(() => {
    let alive = true;
    void import("@data/osm/streets.json").then((m) => {
      if (alive) setStreets(m.default as StreetGeom[]);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="rg-scroll h-full space-y-4 px-3 pb-8 pt-[max(12px,env(safe-area-inset-top))]">
      <header className="flex items-center gap-2.5 px-1 pt-1">
        <Link href="/notebook" aria-label={t(lang, "back")} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface ring-1 ring-line">
          <ArrowLeft size={18} aria-hidden />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-[21px] font-semibold leading-tight">{walk ? walkPlaceLabel(walk, lang) : t(lang, "nbTitle")}</h1>
          {walk ? (
            <p className="truncate tabular-nums" style={{ fontSize: 13, fontWeight: 500, color: "rgba(17,17,17,0.55)" }}>
              {formatTicketDate(walk.startedAt, lang)} · {formatDistance(walk.distanceM)} · {formatDurationShort(mins, lang)}
            </p>
          ) : null}
        </div>
      </header>

      {!walk ? (
        <p className="pt-10 text-center text-sub">{t(lang, "nbNotFound")}</p>
      ) : (
        <>
          <WalkMap walk={walk} discoveries={items} streets={streets} lang={lang} walkNumber={walkNumber} />
          {unplaced.length ? (
            <section aria-label={t(lang, "nbNoGeo")}>
              <h2 className="px-1 pb-2" style={{ fontSize: 12, fontWeight: 600, color: "rgba(17,17,17,0.55)" }}>
                {t(lang, "nbNoGeo")}
              </h2>
              <ul className="rg-scroll flex gap-3 overflow-x-auto px-1 pb-1">
                {unplaced.map((d) => (
                  <li key={d.id} className="w-20 shrink-0">
                    <Link href={`/notebook/item?id=${encodeURIComponent(d.id)}`} className="block">
                      <StickerArt discovery={d} size={72} rotate={-4} className="aspect-square !h-auto !w-full" />
                      <span
                        className="mt-1 block text-center leading-snug"
                        style={{
                          fontSize: 11,
                          fontWeight: 500,
                          color: "rgba(17,17,17,0.7)",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {d.narration.title}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <WalkPage />
    </Suspense>
  );
}
