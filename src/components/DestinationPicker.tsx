"use client";
// Destination picker bottom sheet: search, nearby worth-visiting places,
// tap-the-map, then a route preview with distance + minutes and Start.
import { Loader2, MapPin, Navigation, Search } from "lucide-react";
import type { DestinationWalk } from "@/lib/client/useDestinationWalk";
import { formatDistance, t } from "@/lib/client/i18n";
import { etaMinutes } from "@/lib/client/navEngine";
import type { GeoFix, Lang } from "@/lib/types";
import Sheet from "./Sheet";

export default function DestinationPicker({
  lang,
  dest,
  fix,
  onClose,
  onStart,
}: {
  lang: Lang;
  dest: DestinationWalk;
  fix: GeoFix | null;
  onClose: () => void;
  onStart: () => void;
}) {
  const open = dest.status === "picking" || dest.status === "preview";
  return (
    <Sheet open={open} title={t(lang, "destTitle")} lang={lang} onClose={onClose}>
      {dest.status === "preview" && dest.destination ? (
        <Preview lang={lang} dest={dest} onStart={onStart} onRetry={() => dest.retryRoute(fix)} />
      ) : (
        <Pick lang={lang} dest={dest} fix={fix} />
      )}
    </Sheet>
  );
}

function Pick({ lang, dest, fix }: { lang: Lang; dest: DestinationWalk; fix: GeoFix | null }) {
  return (
    <div className="space-y-4 pb-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (dest.query.trim().length >= 2) dest.searchNow(dest.query.trim());
        }}
        className="flex items-center gap-2"
      >
        <div className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-full border border-line bg-bg px-4 focus-within:border-ink">
          <Search size={16} aria-hidden className="shrink-0 text-sub" />
          <input
            value={dest.query}
            onChange={(e) => dest.setQuery(e.target.value)}
            placeholder={t(lang, "destSearchPh")}
            aria-label={t(lang, "destSearchPh")}
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none"
          />
          {dest.searching ? <Loader2 size={16} aria-hidden className="shrink-0 animate-spin text-sub" /> : null}
        </div>
      </form>

      {dest.query.trim().length >= 2 ? (
        <section aria-label={t(lang, "destSearchPh")}>
          {dest.results.length === 0 && dest.searched && !dest.searching ? (
            <p className="py-2 text-[13px] text-sub">{t(lang, "destNoResults")}</p>
          ) : (
            <ul className="space-y-1.5">
              {dest.results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => dest.chooseResult(r, fix)}
                    className="flex min-h-11 w-full items-center gap-2.5 rounded-2xl bg-fill/70 px-3.5 py-2 text-left"
                  >
                    <MapPin size={16} aria-hidden className="shrink-0 text-sub" />
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-medium">{r.name}</span>
                      {r.label ? <span className="block truncate text-xs text-sub">{r.label}</span> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section aria-label={t(lang, "destNearby")} className="space-y-1.5">
        <h3 className="px-1 text-xs font-medium text-sub">{t(lang, "destNearby")}</h3>
        {dest.nearby === null || dest.nearbyLoading ? (
          <p className="flex items-center gap-2 px-1 py-2 text-[13px] text-sub">
            <Loader2 size={14} aria-hidden className="animate-spin" />
            {t(lang, "destSearching")}
          </p>
        ) : dest.nearby.length === 0 ? (
          <p className="px-1 py-2 text-[13px] text-sub">{t(lang, "destNearbyEmpty")}</p>
        ) : (
          <ul className="space-y-1.5">
            {dest.nearby.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => dest.choosePoi(p, fix)}
                  className="flex min-h-11 w-full items-center gap-2.5 rounded-2xl bg-fill/70 px-3.5 py-2 text-left"
                >
                  <MapPin size={16} aria-hidden className="shrink-0 text-sub" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{p.name ?? p.brand ?? p.kind}</span>
                  </span>
                  <span className="shrink-0 text-xs text-sub">{formatDistance(p.distanceM)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <button
        type="button"
        onClick={() => dest.setPickArmed(!dest.pickArmed)}
        aria-pressed={dest.pickArmed}
        className={`flex h-11 w-full items-center justify-center gap-2 rounded-full px-4 text-[15px] font-medium ${dest.pickArmed ? "bg-ink text-white" : "border border-[rgba(17,17,17,0.12)] bg-white text-ink"}`}
      >
        <Navigation size={16} aria-hidden />
        {t(lang, "destTapMap")}
      </button>
      {dest.pickArmed ? <p className="px-1 text-center text-[13px] text-sub">{t(lang, "destTapHint")}</p> : null}
    </div>
  );
}

function Preview({ lang, dest, onStart, onRetry }: { lang: Lang; dest: DestinationWalk; onStart: () => void; onRetry: () => void }) {
  const route = dest.route;
  return (
    <div className="space-y-3 pb-2">
      <div className="rounded-2xl bg-fill/70 px-4 py-3">
        <p className="truncate text-[17px] font-semibold">{dest.destination?.name}</p>
        {dest.destination?.label ? <p className="truncate text-[13px] text-sub">{dest.destination.label}</p> : null}
        <p className="mt-1 text-[13px] text-sub" aria-live="polite">
          {route && !dest.routing ? (
            t(lang, "destEta", { d: formatDistance(route.distanceM), n: etaMinutes(route, route.distanceM) })
          ) : dest.routeError ? null : (
            <span className="inline-flex items-center gap-2">
              <Loader2 size={14} aria-hidden className="animate-spin" />
              {t(lang, "destSearching")}
            </span>
          )}
        </p>
      </div>
      {dest.routeError && !dest.routing ? (
        <div className="space-y-2">
          <p role="alert" className="text-[13px] text-red-700">
            {dest.routeError}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="h-11 w-full rounded-full border border-[rgba(17,17,17,0.12)] bg-white px-4 text-[15px] font-medium text-ink"
          >
            {t(lang, "destRetry")}
          </button>
        </div>
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => dest.backToPick()}
          className="h-11 shrink-0 rounded-full border border-[rgba(17,17,17,0.12)] bg-white px-4 text-[15px] font-medium text-ink"
        >
          {t(lang, "destChange")}
        </button>
        <button
          type="button"
          onClick={onStart}
          disabled={dest.routing || !route}
          className="h-11 min-w-0 flex-1 rounded-full bg-ink px-4 text-[15px] font-medium text-white disabled:opacity-40"
        >
          {t(lang, "destStart")}
        </button>
      </div>
    </div>
  );
}
