"use client";
import { ArrowLeft, MapPin, Pause, Play } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ConfidenceBadge, ContrastChips, SourceLinks } from "@/components/DiscoveryParts";
import StickerArt from "@/components/StickerArt";
import { unlockAudio } from "@/lib/client/audio";
import { t } from "@/lib/client/i18n";
import { areaLabel } from "@/lib/geo";
import { speak, stopSpeaking } from "@/lib/client/speech";
import { useDiscoveries, useProfile, useWalks } from "@/lib/client/storage";

const ORIGIN_KEY = { guide: "originGuide", ask: "originAsk", photo: "originPhoto" } as const;

function ItemPage() {
  const id = useSearchParams().get("id") ?? "";
  const { profile } = useProfile();
  const lang = profile.lang;
  const d = useDiscoveries().find((x) => x.id === id) ?? null;
  const walk = useWalks().find((w) => w.id === d?.walkId) ?? null;
  const [playing, setPlaying] = useState(false);

  function toggle() {
    if (!d) return;
    if (playing) {
      stopSpeaking();
      setPlaying(false);
      return;
    }
    unlockAudio();
    setPlaying(true);
    void speak(d.narration.text, d.narration.lang).then(() => setPlaying(false));
  }

  return (
    <div className="rg-scroll h-full space-y-5 px-4 pb-8 pt-[max(12px,env(safe-area-inset-top))]">
      <Link href="/notebook" aria-label={t(lang, "back")} onClick={() => stopSpeaking()} className="grid h-11 w-11 place-items-center rounded-full bg-surface ring-1 ring-line">
        <ArrowLeft size={20} aria-hidden />
      </Link>
      {!d ? (
        <p className="pt-10 text-center text-sub">{t(lang, "nbNotFound")}</p>
      ) : (
        <>
          <div className="flex flex-col items-center gap-3 pt-2 text-center">
            <StickerArt discovery={d} size={168} rotate={-4} className="rg-pop" />
            <h1 className="pt-2 text-2xl font-bold leading-tight">{d.narration.title}</h1>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="rounded-full bg-accent px-3 py-1 text-xs font-bold">{t(lang, ORIGIN_KEY[d.origin])}</span>
              <ConfidenceBadge confidence={d.narration.confidence} lang={lang} />
            </div>
          </div>
          <button type="button" onClick={toggle} className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-ink text-base font-bold text-white">
            {playing ? <Pause size={18} fill="currentColor" aria-hidden /> : <Play size={18} fill="currentColor" aria-hidden />}
            {playing ? t(lang, "pause") : t(lang, "playAgain")}
          </button>
          <p className="text-[19px] leading-[1.7]">{d.narration.text}</p>
          <ContrastChips contrast={d.narration.contrast} lang={lang} />
          <SourceLinks sources={d.narration.sources} lang={lang} />
          <section className="space-y-1 rounded-card bg-surface p-4 ring-1 ring-line">
            <h2 className="text-sm font-semibold text-sub">{t(lang, "placeAndTime")}</h2>
            <p className="font-semibold">{new Date(d.at).toLocaleString(lang, { dateStyle: "medium", timeStyle: "short" })}</p>
            <p className="flex items-center gap-1.5 text-sm text-sub">
              <MapPin size={14} aria-hidden />
              {[areaLabel(walk?.areaName ?? null, lang), d.lat !== null && d.lon !== null ? `${d.lat.toFixed(4)}, ${d.lon.toFixed(4)}` : null].filter(Boolean).join(" · ") || t(lang, "noPlace")}
            </p>
          </section>
        </>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ItemPage />
    </Suspense>
  );
}
