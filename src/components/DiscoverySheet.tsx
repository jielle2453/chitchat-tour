"use client";
import { ChevronDown, ChevronUp, Pause, Play } from "lucide-react";
import { useMemo } from "react";
import { t } from "@/lib/client/i18n";
import { discoveryEyebrow } from "@/lib/client/categories";
import { sentenceIndexAt, splitSentences } from "@/lib/client/text";
import type { GuideSession } from "@/lib/client/useGuideSession";
import type { Lang } from "@/lib/types";
import { ConfidenceBadge, ContrastChips, SourceLinks } from "./DiscoveryParts";
import StickerArt from "./StickerArt";

function Subtitles({ text, progress, live }: { text: string; progress: number; live: boolean }) {
  const sentences = useMemo(() => splitSentences(text), [text]);
  const idx = live ? sentenceIndexAt(sentences, progress) : -1;
  return (
    <p className="text-[15px] leading-[1.7]" aria-live="off">
      {sentences.map((s, i) => (
        <span
          key={i}
          className={`rounded-md px-0.5 transition-colors duration-200 [box-decoration-break:clone] ${i === idx ? "bg-ink/10" : ""}`}
        >
          {s}
          {/[.!?]["')\]]?$/.test(s) ? " " : ""}
        </span>
      ))}
    </p>
  );
}

function PlayButton({ session, lang, size = 36 }: { session: GuideSession; lang: Lang; size?: number }) {
  const playing = session.playback.state === "playing" || session.playback.state === "loading";
  return (
    <button
      type="button"
      onClick={session.togglePlay}
      aria-label={playing ? t(lang, "pause") : t(lang, "play")}
      className="grid shrink-0 place-items-center rounded-full bg-ink text-white"
      style={{ width: size, height: size }}
    >
      {playing ? <Pause size={size * 0.42} fill="currentColor" aria-hidden /> : <Play size={size * 0.42} fill="currentColor" aria-hidden />}
    </button>
  );
}

export function MiniPlayer({ session, lang, bottom }: { session: GuideSession; lang: Lang; bottom: number }) {
  const d = session.current;
  if (!d || session.sheet !== "mini") return null;
  return (
    <div className="rg-sheet-in absolute inset-x-3 z-40 flex items-center gap-2.5 rounded-full bg-surface py-1.5 pl-2 pr-2 shadow-[0_8px_28px_rgba(17,17,17,0.14)]" style={{ bottom }}>
      <button type="button" onClick={() => session.setSheet("open")} aria-label={t(lang, "expand")} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
        <StickerArt discovery={d} size={32} rotate={-4} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{d.narration.title}</span>
        <ChevronUp size={16} className="shrink-0 text-sub" aria-hidden />
      </button>
      <PlayButton session={session} lang={lang} size={34} />
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
  const eyebrow = discoveryEyebrow(lang, d.origin, n);
  return (
    <div
      role="region"
      aria-label={n.title}
      className="rg-sheet-in absolute inset-x-0 bottom-0 z-40 flex max-h-[54%] flex-col rounded-t-card bg-surface pb-[max(12px,env(safe-area-inset-bottom))] shadow-[0_-8px_28px_rgba(17,17,17,0.14)]"
    >
      <div className="flex justify-center pb-0.5 pt-2">
        <span aria-hidden className="h-1 w-9 rounded-full bg-line" />
      </div>
      <div className="flex items-center gap-3 px-4 pt-1">
        <p className="min-w-0 flex-1 truncate text-xs font-medium text-sub">{eyebrow}</p>
        <PlayButton session={session} lang={lang} size={34} />
        <button type="button" onClick={() => session.setSheet("mini")} aria-label={t(lang, "minimise")} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-fill">
          <ChevronDown size={16} aria-hidden />
        </button>
      </div>
      <div className="rg-scroll min-h-0 flex-1 space-y-3.5 px-4 pb-2 pt-2.5">
        <div className="flex items-start gap-3.5">
          <StickerArt discovery={d} size={68} rotate={-4} className="rg-pop mt-0.5" />
          <div className="min-w-0 pt-0.5">
            <h2 className="text-[21px] font-semibold leading-snug">{n.title}</h2>
            <div className="mt-1">
              <ConfidenceBadge confidence={n.confidence} lang={lang} />
            </div>
          </div>
        </div>
        <Subtitles text={n.text} progress={session.progress} live={live} />
        <ContrastChips contrast={n.contrast} lang={lang} />
        <SourceLinks sources={n.sources} lang={lang} />
      </div>
      {readOnly ? null : (
        <div className="flex items-center gap-1 px-4 pt-1.5">
          <button
            type="button"
            disabled={session.stuck}
            onClick={() => {
              if (!session.stick()) onSaveFailed?.();
            }}
            className="h-11 flex-1 rounded-full bg-ink text-[15px] font-medium text-white disabled:opacity-70"
          >
            {session.stuck ? t(lang, "stuck") : t(lang, "stickInNotebook")}
          </button>
          <button
            type="button"
            onClick={session.tellMore}
            disabled={session.walk.voice !== "idle"}
            className="h-11 shrink-0 rounded-full px-3.5 text-sm font-medium disabled:opacity-50"
          >
            {session.walk.voice === "thinking" ? t(lang, "checkingSources") : t(lang, "tellMore")}
          </button>
          <button type="button" onClick={session.skip} className="h-11 shrink-0 rounded-full px-3 text-sm font-medium text-sub">
            {t(lang, "skip")}
          </button>
        </div>
      )}
    </div>
  );
}
