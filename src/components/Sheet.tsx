"use client";
import { X } from "lucide-react";
import { useEffect } from "react";
import type { Lang } from "@/lib/types";
import { t } from "@/lib/client/i18n";

// Modal bottom sheet, positioned inside the nearest `relative` frame.
export default function Sheet({
  open,
  title,
  lang,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  lang: Lang;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end">
      <button type="button" aria-label={t(lang, "close")} onClick={onClose} className="rg-fade-in absolute inset-0 bg-ink/30" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="rg-sheet-in relative flex max-h-[85%] flex-col rounded-t-card bg-surface pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-8px_28px_rgba(17,17,17,0.12)]"
      >
        <div className="flex items-center justify-between px-4 pb-1.5 pt-3.5">
          <h2 className="text-[17px] font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label={t(lang, "close")} className="grid h-9 w-9 place-items-center rounded-full bg-fill">
            <X size={16} aria-hidden />
          </button>
        </div>
        <div className="rg-scroll min-h-0 flex-1 px-4 pb-2">{children}</div>
      </div>
    </div>
  );
}
