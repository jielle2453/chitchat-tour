import { ChevronDown, ExternalLink } from "lucide-react";
import { useState } from "react";
import { t } from "@/lib/client/i18n";
import type { Confidence, Lang, Narration } from "@/lib/types";

const CONF_KEY = { high: "confidenceHigh", medium: "confidenceMedium", low: "confidenceLow" } as const;

export function ConfidenceBadge({ confidence, lang }: { confidence: Confidence; lang: Lang }) {
  const dots = confidence === "high" ? 3 : confidence === "medium" ? 2 : 1;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sub">
      <span aria-hidden className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`h-1 w-1 rounded-full ${i < dots ? "bg-ink" : "bg-line"}`} />
        ))}
      </span>
      {t(lang, CONF_KEY[confidence])}
    </span>
  );
}

// "Here" / "Elsewhere": never names where the traveller is from.
// Two quiet columns split by a hairline, not two boxes.
export function ContrastChips({ contrast, lang }: { contrast: Narration["contrast"]; lang: Lang }) {
  if (!contrast || (!contrast.here && !contrast.elsewhere)) return null;
  return (
    <div className="grid grid-cols-2 divide-x divide-line rounded-2xl bg-fill/70">
      <div className="px-3.5 py-3">
        <p className="text-xs font-medium text-sub">{t(lang, "here")}</p>
        <p className="mt-0.5 text-[13px] leading-relaxed">{contrast.here}</p>
      </div>
      <div className="px-3.5 py-3">
        <p className="text-xs font-medium text-sub">{t(lang, "elsewhere")}</p>
        <p className="mt-0.5 text-[13px] leading-relaxed">{contrast.elsewhere}</p>
      </div>
    </div>
  );
}

export function SourceLinks({ sources, lang }: { sources: Narration["sources"]; lang: Lang }) {
  const [open, setOpen] = useState(false);
  if (!sources.length) return null;
  return (
    <div className="text-[13px]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 font-medium text-sub"
      >
        {t(lang, "sources")} · {sources.length}
        <ChevronDown size={14} aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <ul className="mt-1.5 space-y-1.5 text-sub">
          {sources.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline decoration-line underline-offset-2">
                {s.publisher ? `${s.publisher}: ` : ""}
                {s.title}
                <ExternalLink size={11} aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
