import { ExternalLink } from "lucide-react";
import { t } from "@/lib/client/i18n";
import type { Confidence, Lang, Narration } from "@/lib/types";

const CONF_KEY = { high: "confidenceHigh", medium: "confidenceMedium", low: "confidenceLow" } as const;

export function ConfidenceBadge({ confidence, lang }: { confidence: Confidence; lang: Lang }) {
  const dots = confidence === "high" ? 3 : confidence === "medium" ? 2 : 1;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-bg px-2.5 py-1 text-xs font-medium text-sub">
      <span aria-hidden className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`h-1.5 w-1.5 rounded-full ${i < dots ? "bg-ink" : "bg-line"}`} />
        ))}
      </span>
      {t(lang, CONF_KEY[confidence])}
    </span>
  );
}

// "Here" / "Elsewhere": never names where the traveller is from.
export function ContrastChips({ contrast, lang }: { contrast: Narration["contrast"]; lang: Lang }) {
  if (!contrast || (!contrast.here && !contrast.elsewhere)) return null;
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="rounded-2xl border border-line bg-surface p-3">
        <div className="mb-1 inline-block rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold">{t(lang, "here")}</div>
        <p className="text-sm leading-snug">{contrast.here}</p>
      </div>
      <div className="rounded-2xl bg-bg p-3">
        <div className="mb-1 inline-block rounded-full bg-ink px-2 py-0.5 text-[11px] font-bold text-white">{t(lang, "elsewhere")}</div>
        <p className="text-sm leading-snug">{contrast.elsewhere}</p>
      </div>
    </div>
  );
}

export function SourceLinks({ sources, lang }: { sources: Narration["sources"]; lang: Lang }) {
  if (!sources.length) return null;
  return (
    <div className="text-xs text-sub">
      <span className="font-semibold">{t(lang, "sources")}</span>
      <ul className="mt-1 space-y-1">
        {sources.map((s) => (
          <li key={s.url}>
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">
              {s.publisher ? `${s.publisher}: ` : ""}
              {s.title}
              <ExternalLink size={11} aria-hidden />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
