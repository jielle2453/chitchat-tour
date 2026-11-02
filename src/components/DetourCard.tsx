"use client";
// Wander detour suggestion card: "帶我去 / Take me" or "不用了 / No thanks".
import { CornerUpRight } from "lucide-react";
import { formatDistance, t } from "@/lib/client/i18n";
import type { Lang } from "@/lib/types";

export default function DetourCard({
  lang,
  name,
  distanceM,
  onTake,
  onDismiss,
}: {
  lang: Lang;
  name: string;
  distanceM: number;
  onTake: () => void;
  onDismiss: () => void;
}) {
  return (
    <div role="dialog" aria-label={name} className="glass rg-fade-in pointer-events-auto w-full max-w-[340px] rounded-[20px] p-3.5">
      <p className="text-[15px] font-semibold leading-snug">
        {name} <span className="ml-1 font-normal text-sub">{formatDistance(distanceM)}</span>
      </p>
      <div className="mt-2.5 flex gap-2">
        <button
          type="button"
          onClick={onTake}
          className="flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full bg-ink px-4 text-[15px] font-medium text-white"
        >
          <CornerUpRight size={16} aria-hidden />
          {t(lang, "detourTake")}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="h-11 shrink-0 rounded-full border border-[rgba(17,17,17,0.12)] bg-white px-4 text-[15px] font-medium text-ink"
        >
          {t(lang, "detourDismiss")}
        </button>
      </div>
    </div>
  );
}
