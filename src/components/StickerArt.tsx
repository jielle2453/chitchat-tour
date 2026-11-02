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

// The sticker for a discovery: the photo cut-out when there is one, otherwise a category placeholder.
// Image slots stay square so other sticker art can be dropped in later.
export default function StickerArt({
  discovery,
  size = 96,
  rotate = -4,
  className = "",
}: {
  discovery: Pick<Discovery, "stickerDataUrl" | "narration">;
  size?: number;
  rotate?: number;
  className?: string;
}) {
  const style = { width: size, height: size, transform: `rotate(${rotate}deg)` };
  if (discovery.stickerDataUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={discovery.stickerDataUrl}
        alt=""
        draggable={false}
        className={`shrink-0 object-contain drop-shadow-[0_2px_3px_rgba(17,17,17,0.25)] ${className}`}
        style={style}
      />
    );
  }
  const Icon = ICONS[discovery.narration.category ?? "other"] ?? Star;
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center bg-accent ${className}`}
      style={{
        ...style,
        borderRadius: size * 0.22,
        border: `${Math.max(3, Math.round(size * 0.0625))}px solid #fff`,
        boxShadow: "0 0 0 2px #111",
      }}
    >
      <Icon size={Math.round(size * 0.42)} strokeWidth={2.2} color="#111" />
    </span>
  );
}
