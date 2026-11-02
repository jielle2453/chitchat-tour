"use client";
import { useState, type CSSProperties } from "react";
import { Building2, Bus, Coffee, Signpost, Star, Store, type LucideIcon } from "lucide-react";
import type { Discovery, Narration } from "@/lib/types";

const ICONS: Record<NonNullable<Narration["category"]>, LucideIcon> = {
  street: Signpost,
  transport: Bus,
  shop: Store,
  architecture: Building2,
  "daily-life": Coffee,
  other: Star,
};

// The art for a discovery, in priority order:
// 1. the die-cut photo sticker (white border baked in, soft shadow via CSS filter)
// 2. the flat paper-cut illustration for the narrated item, multiply-blended, no frame
// 3. a quiet monochrome category placeholder
// Image slots stay square so other art can be dropped in later.
export default function StickerArt({
  discovery,
  size = 96,
  rotate = -4,
  className = "",
  popDelayMs,
}: {
  discovery: Pick<Discovery, "stickerDataUrl" | "narration">;
  size?: number;
  rotate?: number;
  className?: string;
  // Blend-safe pop-in for the collage map: the rgc-pop keyframes (defined by
  // the caller) run on the img/span ITSELF, so no ancestor of a
  // mix-blend-multiply img ever gets a transform/filter/opacity. Undefined =
  // no animation (existing behaviour everywhere else).
  popDelayMs?: number;
}) {
  const style = { width: size, height: size, transform: `rotate(${rotate}deg)` };
  // Fill backwards: hidden+small during the delay, then the inline transform
  // (plain rotate) takes over once the animation finishes.
  const pop =
    typeof popDelayMs === "number"
      ? ({
          animation: "rgc-pop 420ms cubic-bezier(.2,.9,.2,1.2) backwards",
          animationDelay: `${Math.max(0, popDelayMs)}ms`,
          "--rot": `${rotate}deg`,
        } as CSSProperties)
      : null;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (discovery.stickerDataUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={discovery.stickerDataUrl}
        alt=""
        draggable={false}
        className={`shrink-0 object-contain ${pop ? "rgc-anim" : ""} ${className}`}
        style={{ ...style, ...pop, filter: "drop-shadow(0 5px 9px rgba(0,0,0,0.28))" }}
      />
    );
  }

  const itemId = discovery.narration.itemId;
  const artSrc = itemId ? `/illustrations/${encodeURIComponent(itemId)}.webp` : null;
  if (artSrc && failedSrc !== artSrc) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={artSrc}
        alt={discovery.narration.title}
        draggable={false}
        onError={() => setFailedSrc(artSrc)}
        className={`shrink-0 object-contain mix-blend-multiply ${pop ? "rgc-anim" : ""} ${className}`}
        style={{ ...style, ...pop }}
      />
    );
  }

  const Icon = ICONS[discovery.narration.category ?? "other"] ?? Star;
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center bg-neutral-200 ${pop ? "rgc-anim" : ""} ${className}`}
      style={{ ...style, ...pop, borderRadius: size * 0.22 }}
    >
      <Icon size={Math.round(size * 0.42)} strokeWidth={1.5} className="text-neutral-500" />
    </span>
  );
}
