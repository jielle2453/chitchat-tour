"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import TicketCard from "@/components/notebook/TicketCard";
import ThemeJar from "@/components/notebook/ThemeJar";
import { t } from "@/lib/client/i18n";
import { formatMonthTitle, groupByTheme, groupWalksByMonth, newestWalksFirst, type ThemeKey } from "@/lib/client/notebookData";
import { useDiscoveries, useProfile, useWalks } from "@/lib/client/storage";
import type { Discovery } from "@/lib/types";

const INK_55 = "rgba(17,17,17,0.55)";

export default function NotebookPage() {
  const { profile } = useProfile();
  const lang = profile.lang;
  const discoveries = useDiscoveries();
  const walks = useWalks();
  const [view, setView] = useState<"walks" | "themes">("walks");
  const [openJar, setOpenJar] = useState<ThemeKey | null>(null);

  // walks without stickers are not shown
  const sortedWalks = useMemo(() => newestWalksFirst(walks.filter((w) => w.discoveryIds.length > 0)), [walks]);
  const walkMonths = useMemo(() => groupWalksByMonth(sortedWalks), [sortedWalks]);
  const themes = useMemo(() => groupByTheme(discoveries).filter((g) => g.items.length > 0), [discoveries]);
  const byWalk = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of discoveries) if (d.walkId) map.set(d.walkId, (map.get(d.walkId) ?? 0) + 1);
    return map;
  }, [discoveries]);
  const stickersByWalk = useMemo(() => {
    const byId = new Map(discoveries.map((d) => [d.id, d]));
    const map = new Map<string, Discovery[]>();
    const push = (walkId: string, d: Discovery) => map.set(walkId, [...(map.get(walkId) ?? []), d]);
    for (const d of discoveries) if (d.walkId) push(d.walkId, d);
    for (const w of walks) {
      for (const id of w.discoveryIds) {
        const d = byId.get(id);
        if (d && d.walkId !== w.id) push(w.id, d);
      }
    }
    return map;
  }, [discoveries, walks]);

  return (
    <div className="rg-scroll h-full space-y-4 px-4 pb-8 pt-[max(20px,env(safe-area-inset-top))]">
      <h1 className="px-1 text-[26px] font-semibold leading-tight">{t(lang, "nbTitle")}</h1>
      {discoveries.length === 0 ? (
        <div className="flex flex-col items-center gap-3 pt-16 text-center">
          <div aria-hidden className="grid h-16 w-16 -rotate-6 place-items-center rounded-[20px] border-4 border-white bg-fill text-3xl font-extrabold shadow-[0_0_0_2px_#111]">
            ?
          </div>
          <h2 className="pt-1 text-xl font-semibold">{t(lang, "nbEmptyTitle")}</h2>
          <p className="max-w-[16rem] text-[15px] text-sub">{t(lang, "nbEmptyBody")}</p>
          <Link href="/" className="mt-1 inline-flex h-11 items-center rounded-full bg-ink px-5 text-[15px] font-medium text-white">
            {t(lang, "nbEmptyGo")}
          </Link>
        </div>
      ) : (
        <>
          <div
            role="group"
            aria-label={t(lang, "nbTitle")}
            className="flex h-9 w-fit rounded-[12px] p-[3px]"
            style={{ background: "rgba(17,17,17,0.05)" }}
          >
            {(["walks", "themes"] as const).map((v) => {
              const active = view === v;
              return (
                <button
                  key={v}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setView(v)}
                  className="rounded-[9px] px-4 text-[13px] font-medium"
                  style={
                    active
                      ? { background: "#fff", color: "#111", boxShadow: "0 1px 2px rgba(17,17,17,0.08)" }
                      : { background: "transparent", color: INK_55 }
                  }
                >
                  {t(lang, v === "walks" ? "nbWalks" : "nbThemes")}
                </button>
              );
            })}
          </div>
          {view === "walks" ? (
            <div className="space-y-5">
              {walkMonths.map((g) => (
                <section key={g.key} aria-label={formatMonthTitle(g.year, g.month, lang)}>
                  {walkMonths.length > 1 ? (
                    <h2 className="px-1 pb-2 text-[13px] font-semibold" style={{ color: INK_55 }}>
                      {formatMonthTitle(g.year, g.month, lang)}
                    </h2>
                  ) : null}
                  <div className="space-y-3">
                    {g.walks.map((w) => (
                      <TicketCard
                        key={w.id}
                        walk={w}
                        count={byWalk.get(w.id) ?? w.discoveryIds.length}
                        lang={lang}
                        stickers={stickersByWalk.get(w.id) ?? []}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : openJar ? (
            <div className="space-y-3">
              {themes
                .filter((g) => g.key === openJar)
                .map((g) => (
                  <ThemeJar key={g.key} theme={g.key} items={g.items} lang={lang} expanded onToggle={() => setOpenJar(null)} />
                ))}
              <div className="grid grid-cols-2 gap-3">
                {themes
                  .filter((g) => g.key !== openJar)
                  .map((g) => (
                    <ThemeJar key={g.key} theme={g.key} items={g.items} lang={lang} expanded={false} onToggle={() => setOpenJar(g.key)} />
                  ))}
              </div>
            </div>
          ) : (
            <div className="relative">
              {/* soft colour field so the glass reads */}
              <div aria-hidden className="pointer-events-none absolute inset-0 overflow-visible">
                <div className="absolute -left-16 -top-10 h-[220px] w-[220px] rounded-full blur-[60px]" style={{ background: "#f2c98f", opacity: 0.18 }} />
                <div className="absolute -right-20 top-1/3 h-[220px] w-[220px] rounded-full blur-[60px]" style={{ background: "#a9c6bb", opacity: 0.18 }} />
              </div>
              <div className="relative grid grid-cols-2 gap-3">
                {themes.map((g) => (
                  <ThemeJar key={g.key} theme={g.key} items={g.items} lang={lang} expanded={false} onToggle={() => setOpenJar(g.key)} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
