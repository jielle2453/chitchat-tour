"use client";
import { ChevronDown, ChevronUp, Pause, Play } from "lucide-react";
import { useMemo } from "react";
import { t } from "@/lib/client/i18n";
import { sentenceIndexAt, splitSentences } from "@/lib/client/text";
import type { GuideSession } from "@/lib/client/useGuideSession";
import type { Lang } from "@/lib/types";
import { ConfidenceBadge, ContrastChips, SourceLinks } from "./DiscoveryParts";
import StickerArt from "./StickerArt";

const ORIGIN_KEY = { guide: "originGuide", ask: "originAsk", photo: "originPhoto" } as const;

function Subtitles({ text, progress, live }: { text: string; progress: number; live: boolean }) {
  const sentences = useMemo(() => splitSentences(text), [text]);
  const idx = live ? sentenceIndexAt(sentences, progress) : -1;
  return (
    <p className="text-[19px] leading-[1.7]" aria-live="off">
      {sentences.map((s, i) => (
        <span
          key={i}
          className={`rounded-md px-0.5 transition-colors duration-200 [box-decoration-break:clone] ${i === idx ? "bg-accent" : ""}`}
        >
          {s}
          {/[.!?]["')\]]?$/.test(s) ? " " : ""}
        </span>
      ))}
    </p>
  );
}

function PlayButton({ session, lang, size = 44 }: { session: GuideSession; lang: Lang; size?: number }) {
  const playing = session.playback.state === "playing" || session.playback.state === "loading";
  return (
    <button
      type="button"
      onClick={session.togglePlay}
      aria-label={playing ? t(lang, "pause") : t(lang, "play")}
      className="grid shrink-0 place-items-center rounded-full bg-ink text-white"
      style={{ width: size, height: size }}
    >
      {playing ? <Pause size={size * 0.4} fill="currentColor" aria-hidden /> : <Play size={size * 0.4} fill="currentColor" aria-hidden />}
    </button>
  );
}

export function MiniPlayer({ session, lang, bottom }: { session: GuideSession; lang: Lang; bottom: number }) {
  const d = session.current;
  if (!d || session.sheet !== "mini") return null;
  return (
    <div className="rg-sheet-in absolute inset-x-3 z-40 flex items-center gap-3 rounded-card bg-surface p-2 pr-3 shadow-[0_8px_28px_rgba(17,17,17,0.14)]" style={{ bottom }}>
      <button type="button" onClick={() => session.setSheet("open")} aria-label={t(lang, "expand")} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <StickerArt discovery={d} size={44} rotate={-4} />
        <span className="min-w-0 flex-1 truncate font-semibold">{d.narration.title}</span>
        <ChevronUp size={18} className="shrink-0 text-sub" aria-hidden />
      </button>
      <PlayButton session={session} lang={lang} size={40} />
    </div>
  );
}

export default function DiscoverySheet({
  session,
  lang,
  readOnly = false,
  onSaveFailed,
}: {
  session: GuideSession;
  lang: Lang;
  readOnly?: boolean;
  onSaveFailed?: () => void;
}) {
  const d = session.current;
  if (!d || session.sheet !== "open") return null;
  const n = d.narration;
  const live = session.playback.state === "playing" || session.playback.state === "paused" || session.playback.state === "loading";
  return (
    <div
      role="region"
      aria-label={n.title}
      className="rg-sheet-in absolute inset-x-0 bottom-0 z-40 flex max-h-[78%] flex-col rounded-t-card bg-surface pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-8px_28px_rgba(17,17,17,0.14)]"
    >
      <div className="flex justify-center pb-1 pt-2">
        <span aria-hidden className="h-1 w-10 rounded-full bg-line" />
      </div>
      <div className="flex items-center justify-between px-5 pt-1">
        <p className="text-xs font-medium text-sub">{t(lang, ORIGIN_KEY[d.origin])}</p>
        <div className="flex items-center gap-2">
          <PlayButton session={session} lang={lang} size={40} />
          <button type="button" onClick={() => session.setSheet("mini")} aria-label={t(lang, "minimise")} className="grid h-10 w-10 place-items-center rounded-full bg-bg">
            <ChevronDown size={20} aria-hidden />
          </button>
        </div>
      </div>
      <div className="rg-scroll min-h-0 flex-1 space-y-4 px-5 pb-3 pt-2">
        <div className="flex items-center gap-4">
          <StickerArt discovery={d} size={84} rotate={-4} className="rg-pop" />
          <div className="min-w-0">
            <h2 className="text-[22px] font-bold leading-tight">{n.title}</h2>
            <div className="mt-1.5">
              <ConfidenceBadge confidence={n.confidence} lang={lang} />
            </div>
          </div>
        </div>
        <Subtitles text={n.text} progress={session.progress} live={live} />
        <ContrastChips contrast={n.contrast} lang={lang} />
        <SourceLinks sources={n.sources} lang={lang} />
      </div>
      {readOnly ? null : (
        <div className="space-y-2 px-5 pt-2">
          <button
            type="button"
            disabled={session.stuck}
            onClick={() => {
              if (!session.stick()) onSaveFailed?.();
            }}
            className="h-14 w-full rounded-full bg-accent text-base font-bold text-ink disabled:opacity-70"
          >
            {session.stuck ? t(lang, "stuck") : t(lang, "stickInNotebook")}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={session.tellMore}
              disabled={session.walk.voice !== "idle"}
              className="h-12 flex-1 rounded-full border border-ink text-base font-semibold disabled:opacity-50"
            >
              {session.walk.voice === "thinking" ? t(lang, "thinking") : t(lang, "tellMore")}
            </button>
            <button type="button" onClick={session.skip} className="h-12 flex-1 rounded-full text-base font-semibold text-sub">
              {t(lang, "skip")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
