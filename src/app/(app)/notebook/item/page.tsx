"use client";
import { ArrowLeft, MapPin, Pause, Play } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ConfidenceBadge, ContrastChips, SourceLinks } from "@/components/DiscoveryParts";
import DieCutImg from "@/components/DieCutImg";
import StickerArt from "@/components/StickerArt";
import { unlockAudio } from "@/lib/client/audio";
import { t } from "@/lib/client/i18n";
import { areaLabel } from "@/lib/geo";
import { speak, stopSpeaking } from "@/lib/client/speech";
import { useDiscoveries, useProfile, useWalks } from "@/lib/client/storage";

const ORIGIN_KEY = { guide: "originGuide", ask: "originAsk", photo: "originPhoto" } as const;

function ItemPage() {
  const id = useSearchParams().get("id") ?? "";
  const router = useRouter();
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
    <div className="rg-scroll h-full space-y-7 px-4 pb-10 pt-[max(12px,env(safe-area-inset-top))]">
      <Link
        href="/notebook"
        aria-label={t(lang, "back")}
        onClick={(e) => {
          stopSpeaking();
          // came from a walk page or the themes tab: go back there, not to the list
          if (window.history.length > 1) {
            e.preventDefault();
            router.back();
          }
        }}
        className="grid h-10 w-10 place-items-center rounded-full bg-surface ring-1 ring-line"
      >
        <ArrowLeft size={18} aria-hidden />
      </Link>
      {!d ? (
        <p className="pt-10 text-center text-sub">{t(lang, "nbNotFound")}</p>
      ) : (
        <>
          <div className="flex flex-col items-center gap-3 pt-1 text-center">
            {/* the story's sticker itself, die-cut, no tile behind it */}
            <div className="rg-pop" style={{ width: 176, height: 176, filter: "drop-shadow(0 4px 8px rgba(17,17,17,0.14))" }}>
              {d.stickerDataUrl || !d.narration.itemId ? (
                <StickerArt discovery={d} size={176} rotate={0} />
              ) : (
                <DieCutImg src={`/illustrations/${encodeURIComponent(d.narration.itemId)}.webp`} size={176} style={{ width: "100%", height: "100%" }} />
              )}
            </div>
            {d.origin !== "guide" ? <p className="text-xs font-medium text-sub">{t(lang, ORIGIN_KEY[d.origin])}</p> : null}
            <h1 className="text-[22px] font-semibold leading-snug">{d.narration.title}</h1>
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
