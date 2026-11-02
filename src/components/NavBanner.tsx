"use client";
// Next-turn banner: 32px ink arrow circle + distance / instruction.
import { ArrowLeft, ArrowRight, ArrowUp, Flag, Undo2 } from "lucide-react";
import { formatDistance } from "@/lib/client/i18n";
import type { Lang } from "@/lib/types";

export type NavArrow = "left" | "right" | "straight" | "uturn" | "arrive";

export function arrowForModifier(modifier?: string, arrive = false): NavArrow {
  if (arrive) return "arrive";
  const m = (modifier ?? "").toLowerCase();
  if (m.includes("uturn")) return "uturn";
  if (m.includes("left")) return "left";
  if (m.includes("right")) return "right";
  return "straight";
}

const ICONS = { left: ArrowLeft, right: ArrowRight, straight: ArrowUp, uturn: Undo2, arrive: Flag };

export default function NavBanner({ text, distanceM, arrow }: { lang: Lang; text: string; distanceM: number; arrow: NavArrow }) {
  const Icon = ICONS[arrow];
  return (
    <div role="status" className="glass rg-fade-in pointer-events-auto flex h-[52px] w-full items-center gap-2.5 rounded-2xl px-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink text-white">
        <Icon size={16} aria-hidden />
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block text-[15px] font-semibold text-ink">{formatDistance(distanceM)}</span>
        <span className="block truncate text-[13px] font-medium text-ink/70">{text}</span>
      </span>
    </div>
  );
}
