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
    <div className="rg-scroll h-full space-y-4 px-4 pb-8 pt-[max(12px,env(safe-area-inset-top))]">
      <Link href="/notebook" aria-label={t(lang, "back")} onClick={() => stopSpeaking()} className="grid h-10 w-10 place-items-center rounded-full bg-surface ring-1 ring-line">
        <ArrowLeft size={18} aria-hidden />
      </Link>
      {!d ? (
        <p className="pt-10 text-center text-sub">{t(lang, "nbNotFound")}</p>
      ) : (
        <>
          <div className="flex flex-col items-center gap-2.5 pt-1 text-center">
            <div className="rg-pop rounded-[28px] bg-white p-3 ring-1 ring-line">
              <StickerArt discovery={d} size={160} rotate={0} />
            </div>
            <p className="text-xs font-medium text-sub">{t(lang, ORIGIN_KEY[d.origin])}</p>
            <h1 className="-mt-1 text-[22px] font-semibold leading-snug">{d.narration.title}</h1>
            <ConfidenceBadge confidence={d.narration.confidence} lang={lang} />
          </div>
          <button type="button" onClick={toggle} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-ink text-[15px] font-medium text-white">
            {playing ? <Pause size={16} fill="currentColor" aria-hidden /> : <Play size={16} fill="currentColor" aria-hidden />}
            {playing ? t(lang, "pause") : t(lang, "playAgain")}
          </button>
          <p className="text-[15px] leading-[1.7]">{d.narration.text}</p>
          <ContrastChips contrast={d.narration.contrast} lang={lang} />
          <SourceLinks sources={d.narration.sources} lang={lang} />
          <section className="space-y-1 rounded-2xl bg-surface p-3.5 ring-1 ring-line">
            <h2 className="text-[13px] font-medium text-sub">{t(lang, "placeAndTime")}</h2>
            <p className="text-[15px] font-medium">{new Date(d.at).toLocaleString(lang, { dateStyle: "medium", timeStyle: "short" })}</p>
            <p className="flex items-center gap-1.5 text-[13px] text-sub">
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
