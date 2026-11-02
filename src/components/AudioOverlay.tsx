"use client";
import type { Lang } from "@/lib/types";
import { resumeAudio, useAudioNeedsTap } from "@/lib/client/audio";
import { t } from "@/lib/client/i18n";

export default function AudioOverlay({ lang }: { lang: Lang }) {
  const needsTap = useAudioNeedsTap();
  if (!needsTap) return null;
  return (
    <button
      type="button"
      onClick={resumeAudio}
      className="rg-fade-in fixed inset-0 z-[2000] flex flex-col items-center justify-center gap-3 bg-ink/90 p-8 text-center text-white"
    >
      <span className="rounded-full bg-white px-5 py-2.5 text-xl font-semibold text-ink">{t(lang, "tapToContinue")}</span>
      <span className="max-w-xs text-sm opacity-90">{t(lang, "tapToContinueSub")}</span>
    </button>
  );
}
