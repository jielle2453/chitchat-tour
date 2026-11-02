import { AlertTriangle, CheckCircle2, Crosshair, Flag, MapPin, SkipForward, UserRound, type LucideIcon } from "lucide-react";
import type { Lang, TraceKind, TraceStep } from "@/lib/types";
import { t } from "@/lib/client/i18n";

const ICON: Record<TraceKind, LucideIcon> = {
  position: MapPin,
  user: UserRound,
  candidate: Crosshair,
  skip: SkipForward,
  verify: CheckCircle2,
  decision: Flag,
  error: AlertTriangle,
};

// The guide's reasoning, one line per step (shown inside a sheet).
export default function TracePanel({ steps, lang }: { steps: TraceStep[]; lang: Lang }) {
  const recent = steps.slice(-60);
  if (recent.length === 0) return <p className="py-6 text-center text-sm text-sub">{t(lang, "noTrace")}</p>;
  return (
    <ol className="space-y-2.5 pb-2 text-sm">
      {recent.map((s, i) => {
        const Icon = ICON[s.kind];
        return (
          <li key={i} className={`flex gap-2.5 ${s.kind === "decision" ? "font-semibold" : ""} ${s.kind === "skip" ? "text-sub" : ""} ${s.kind === "error" ? "text-red-700" : ""}`}>
            <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${s.kind === "decision" ? "bg-accent" : "bg-bg"}`}>
              <Icon size={13} aria-hidden />
            </span>
            <span>
              <span className="sr-only">{s.kind}: </span>
              {s.message}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
