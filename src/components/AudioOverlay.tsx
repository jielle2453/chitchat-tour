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
      <span className="rounded-full bg-accent px-6 py-3 text-2xl font-bold text-ink">{t(lang, "tapToContinue")}</span>
      <span className="max-w-xs text-base opacity-90">{t(lang, "tapToContinueSub")}</span>
    </button>
  );
}
