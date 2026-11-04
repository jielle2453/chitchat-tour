"use client";
import { ArrowLeft, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import WalkMap from "@/components/notebook/WalkMap";
import { t } from "@/lib/client/i18n";
import type { StreetGeom } from "@/lib/client/handDrawn";
import { useDiscoveries, useProfile, useWalks } from "@/lib/client/storage";

function WalkPage() {
  const id = useSearchParams().get("id") ?? "";
  const { profile } = useProfile();
  const lang = profile.lang;
  const walks = useWalks();
  const discoveries = useDiscoveries();
  const [streets, setStreets] = useState<StreetGeom[]>([]);
  const [replay, setReplay] = useState(0);

  const walk = useMemo(() => walks.find((w) => w.id === id) ?? null, [walks, id]);
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
    <div className="relative flex h-full flex-col overflow-hidden">
      <div className="relative flex h-12 shrink-0 items-center justify-between px-3 pt-[max(0px,env(safe-area-inset-top))]">
        <Link href="/notebook" aria-label={t(lang, "back")} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface ring-1 ring-line">
          <ArrowLeft size={18} aria-hidden />
        </Link>
        <button
          type="button"
          onClick={() => setReplay((r) => r + 1)}
          className="inline-flex h-9 items-center gap-1.5 rounded-full px-3.5"
          style={{
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
      <div className="relative min-h-0 flex-1" style={{ margin: "10px 14px 14px 12px" }}>
        {!walk ? (
          <p className="pt-10 text-center text-sub">{t(lang, "nbNotFound")}</p>
        ) : (
          <WalkMap walk={walk} discoveries={items} unplaced={unplaced} streets={streets} lang={lang} replayKey={replay} />
        )}
      </div>
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
