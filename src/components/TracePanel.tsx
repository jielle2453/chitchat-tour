import { BookCheck, Crosshair, Eye, MessageCircle, Search, Volume2, VolumeX, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import type { Lang, TraceStep } from "@/lib/types";
import { t } from "@/lib/client/i18n";
import { prepareTrace, type TraceGroup } from "@/lib/client/traceText";

const ICON: Record<TraceGroup, LucideIcon> = {
  look: Eye,
  consider: Crosshair,
  research: Search,
  check: BookCheck,
  speak: Volume2,
  quiet: VolumeX,
  ask: MessageCircle,
};

function Dots() {
  return (
    <span aria-hidden className="ml-1.5 inline-flex items-center gap-1 align-middle">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-1 w-1 rounded-full bg-ink motion-safe:animate-pulse"
          style={{ animationDelay: `${i * 280}ms` }}
        />
      ))}
    </span>
  );
}

function Bar({ pct, label }: { pct: number; label: string }) {
  return (
    <span className="mt-1.5 flex items-center gap-1.5">
      <span aria-hidden className="h-[3px] w-16 overflow-hidden rounded-full bg-line">
        <span className="block h-full rounded-full bg-ink" style={{ width: `${Math.max(4, Math.min(100, Math.round(pct * 100)))}%` }} />
      </span>
      <span className="text-[11px] tabular-nums text-sub">{label}</span>
    </span>
  );
}

// The guide's reasoning as a calm live timeline, newest first.
export default function TracePanel({ steps, lang }: { steps: TraceStep[]; lang: Lang }) {
  const [now] = useState(() => Date.now());
  const items = useMemo(() => prepareTrace(steps, lang, now), [steps, lang, now]);
  if (items.length === 0) return <p className="py-6 text-center text-[13px] text-sub">{t(lang, "noTrace")}</p>;
  return (
    <ol className="pb-2">
      {items.map((s, i) => {
        const Icon = ICON[s.group];
        const last = i === items.length - 1;
        const speak = s.group === "speak";
        const quiet = s.group === "quiet";
        return (
          <li key={`${s.at}-${i}`} className="relative flex gap-2.5 pb-3.5 last:pb-0">
            {!last ? <span aria-hidden className="absolute bottom-0 left-[11px] top-7 w-px bg-line" /> : null}
            <span
              className={`z-10 grid h-6 w-6 shrink-0 place-items-center rounded-full ${
                speak ? "bg-ink text-white" : quiet ? "bg-fill text-sub" : "bg-fill text-ink"
              }`}
            >
              <Icon size={13} strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-baseline justify-between gap-2">
                <p className={`min-w-0 flex-1 text-[13px] leading-relaxed ${speak ? "font-semibold" : ""} ${quiet ? "text-sub" : ""}`}>
                  {s.text}
                  {s.count > 1 ? (
                    <span className="ml-1.5 rounded-full bg-fill px-1.5 py-px align-middle text-[11px] font-semibold tabular-nums text-sub">
                      ×{s.count}
                    </span>
                  ) : null}
                  {s.live && i === 0 ? <Dots /> : null}
                </p>
                <span className="shrink-0 text-[11px] tabular-nums text-sub">{s.age}</span>
              </div>
              {s.detail?.length ? (
                <ul className="mt-0.5 space-y-px">
                  {s.detail.map((d, j) => (
                    <li key={j} className="truncate text-xs text-sub">
                      {d}
                    </li>
                  ))}
                </ul>
              ) : null}
              {s.visual?.kind === "sources" && s.visual.total > 0 ? (
                <Bar pct={s.visual.kept / s.visual.total} label={`${s.visual.total} → ${s.visual.kept}`} />
              ) : null}
              {s.visual?.kind === "score" ? <Bar pct={s.visual.score} label={s.visual.score.toFixed(2)} /> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
