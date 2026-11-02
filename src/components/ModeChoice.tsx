"use client";
// Small centered mode choice: wander now, or pick a destination first.
import { Footprints, MapPin } from "lucide-react";
import { t } from "@/lib/client/i18n";
import type { Lang } from "@/lib/types";

export default function ModeChoice({
  lang,
  onWander,
  onDestination,
  onClose,
}: {
  lang: Lang;
  onWander: () => void;
  onDestination: () => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-40 grid place-items-center p-6">
      <button type="button" aria-label={t(lang, "close")} onClick={onClose} className="rg-fade-in absolute inset-0 bg-ink/30" />
      <div role="dialog" aria-modal="true" aria-label={t(lang, "modeTitle")} className="glass rg-fade-in relative w-full max-w-[300px] rounded-[20px] p-4">
        <h2 className="px-1 pb-2 text-center text-[17px] font-semibold">{t(lang, "modeTitle")}</h2>
        <div className="space-y-2">
          <button
            type="button"
            onClick={onWander}
            className="flex h-11 w-full items-center gap-3 rounded-full bg-ink px-4 text-left text-[15px] font-medium text-white"
          >
            <Footprints size={20} aria-hidden className="shrink-0" />
            <span>
              <span className="block text-[15px] font-medium leading-tight">{t(lang, "modeWander")}</span>
              <span className="block text-xs font-normal opacity-70">{t(lang, "modeWanderSub")}</span>
            </span>
          </button>
          <button
            type="button"
            onClick={onDestination}
            className="flex h-11 w-full items-center gap-3 rounded-full border border-[rgba(17,17,17,0.12)] bg-white px-4 text-left text-[15px] font-medium text-ink"
          >
            <MapPin size={20} aria-hidden className="shrink-0" />
            <span>
              <span className="block text-[15px] font-medium leading-tight">{t(lang, "modeDest")}</span>
              <span className="block text-xs font-normal text-sub">{t(lang, "modeDestSub")}</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
