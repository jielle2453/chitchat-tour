"use client";
import { Brain, Camera, History, Keyboard, LocateFixed, Mic, Pause, Play, Send } from "lucide-react";
import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { unlockAudio } from "@/lib/client/audio";
import { formatDistance, t } from "@/lib/client/i18n";
import { areaLabel } from "@/lib/geo";
import type { GuideSession } from "@/lib/client/useGuideSession";
import type { Lang, RouteDef, UserProfile } from "@/lib/types";
import DiscoverySheet, { MiniPlayer } from "./DiscoverySheet";
import PhotoView from "./PhotoView";
import Sheet from "./Sheet";
import StickerArt from "./StickerArt";
import TracePanel from "./TracePanel";

const GuideMap = dynamic(() => import("./GuideMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-[#e9e9e6]" />,
});

const SPEEDS = [1, 2, 4];

const round = "grid place-items-center rounded-full bg-surface shadow-[0_4px_16px_rgba(17,17,17,0.14)]";

export default function WalkScreen({
  session,
  profile,
  lang,
  route,
  embedded = false,
  label,
}: {
  session: GuideSession;
  profile: UserProfile;
  lang: Lang;
  route: RouteDef | null;
  embedded?: boolean; // compare mode: no controls, the page drives the walk
  label?: string; // traveller name shown in the top card
}) {
  const { walk } = session;
  const [follow, setFollow] = useState(true);
  const [recenterKey, setRecenterKey] = useState(0);
  const [panel, setPanel] = useState<null | "type" | "trace" | "heard">(null);
  const [question, setQuestion] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  };

  const voiceBusy = walk.voice !== "idle";
  const micLabel =
    walk.voice === "listening" ? t(lang, "listening") : walk.voice === "transcribing" ? t(lang, "transcribing") : walk.voice === "thinking" ? t(lang, "thinking") : t(lang, "holdToAsk");
  const barBottom = embedded ? 12 : session.active ? 112 : 184;
  const showSim = !embedded && !!route && session.active;

  function submitQuestion(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;
    setQuestion("");
    setPanel(null);
    void session.askText(q);
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-bg">
      <div className="absolute inset-0 isolate z-0">
        <GuideMap
          path={session.path}
          fix={walk.fix}
          pins={walk.pins}
          checked={walk.checked}
          routePreview={route?.coordinates}
          follow={follow}
          recenterKey={recenterKey}
          onUserPan={() => setFollow(false)}
          lang={lang}
        />
      </div>
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noopener noreferrer"
        className="absolute left-3 z-10 rounded-full bg-surface/80 px-2 py-0.5 text-[10px] text-sub"
        style={{ bottom: embedded ? 4 : session.active ? 104 : 176 }}
      >
        OpenFreeMap &copy; OpenMapTiles &copy; OpenStreetMap contributors
      </a>

      {/* top card */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 space-y-2 px-3 pt-[max(12px,env(safe-area-inset-top))]">
        <div className="pointer-events-auto flex items-center gap-3 rounded-card bg-surface p-3 pl-4 shadow-[0_8px_28px_rgba(17,17,17,0.12)]">
          <div className="min-w-0 flex-1">
            {label ? <p className="text-xs font-semibold text-sub">{label}</p> : null}
            <p className="truncate text-lg font-bold leading-tight">{areaLabel(walk.area, lang) ?? t(lang, "unknownArea")}</p>
            <p className="truncate text-sm text-sub">
              {t(lang, "walkedDistance", { d: formatDistance(session.distanceM) })} · {t(lang, "foundToday", { n: session.heardToday.length })}
            </p>
          </div>
          {!embedded && session.active ? (
            <button type="button" onClick={session.end} className="h-10 shrink-0 rounded-full border border-line px-4 text-sm font-semibold">
              {t(lang, "endWalk")}
            </button>
          ) : null}
        </div>
        {showSim ? (
          <div className="pointer-events-auto flex w-fit items-center gap-1 rounded-full bg-surface p-1 shadow-[0_4px_16px_rgba(17,17,17,0.12)]">
            <button
              type="button"
              onClick={session.simToggle}
              aria-label={session.simPlaying ? t(lang, "simPause") : t(lang, "simPlay")}
              className="grid h-9 w-9 place-items-center rounded-full bg-ink text-white"
            >
              {session.simPlaying ? <Pause size={15} fill="currentColor" aria-hidden /> : <Play size={15} fill="currentColor" aria-hidden />}
            </button>
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={session.simSpeed === s}
                onClick={() => session.setSimSpeed(s)}
                className={`h-9 min-w-9 rounded-full px-2.5 text-sm font-bold ${session.simSpeed === s ? "bg-accent" : "text-sub"}`}
              >
                {t(lang, "speedPill", { n: s })}
              </button>
            ))}
          </div>
        ) : null}
        {walk.error ? (
          <p role="alert" className="pointer-events-auto rounded-2xl bg-surface p-3 text-sm text-red-700 shadow-[0_4px_16px_rgba(17,17,17,0.12)]">
            {walk.error.notReady ? t(lang, "moduleNotReady") : `${t(lang, "error")} ${walk.error.message}`}
          </p>
        ) : null}
        {toast ? (
          <p role="status" className="rg-fade-in pointer-events-auto w-fit rounded-full bg-ink px-4 py-2 text-sm text-white">
            {toast}
          </p>
        ) : null}
        {(voiceBusy && walk.voice !== "listening") || session.explaining ? (
          <p role="status" className="pointer-events-auto w-fit rounded-full bg-ink px-4 py-2 text-sm text-white">
            {session.explaining ? t(lang, "explaining") : micLabel}
          </p>
        ) : null}
      </div>

      {/* round buttons */}
      <div className="absolute right-3 z-10 flex flex-col gap-2" style={{ bottom: barBottom + (session.current && session.sheet === "mini" ? 76 : 8) }}>
        <button type="button" onClick={() => setPanel("trace")} aria-label={t(lang, "guideThinking")} className={`${round} h-11 w-11`}>
          <Brain size={20} aria-hidden />
        </button>
        <button type="button" onClick={() => setPanel("heard")} aria-label={t(lang, "heardTodayTitle")} className={`${round} h-11 w-11`}>
          <History size={20} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => {
            setFollow(true);
            setRecenterKey((k) => k + 1);
          }}
          aria-label={t(lang, "recenter")}
          className={`${round} h-11 w-11`}
        >
          <LocateFixed size={20} aria-hidden />
        </button>
      </div>

      {/* bottom: start button + action bar */}
      {!embedded ? (
        <div className="absolute inset-x-0 bottom-0 z-20 space-y-3 px-3 pb-3">
          {!session.active ? (
            <button type="button" onClick={session.begin} className="h-16 w-full rounded-full bg-ink text-lg font-bold text-white shadow-[0_8px_28px_rgba(17,17,17,0.2)]">
              {t(lang, "startWalk")}
            </button>
          ) : null}
          <div className="flex items-end justify-around rounded-[28px] bg-surface px-4 pb-2 pt-3 shadow-[0_8px_28px_rgba(17,17,17,0.12)]">
            <button
              type="button"
              onClick={() => {
                unlockAudio();
                setPanel("type");
              }}
              className="flex w-20 flex-col items-center gap-1 pb-1 text-xs font-semibold"
            >
              <span className="grid h-12 w-12 place-items-center rounded-full bg-bg">
                <Keyboard size={22} aria-hidden />
              </span>
              {t(lang, "typeAsk")}
            </button>
            <button
              type="button"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                unlockAudio();
                void walk.startListening();
              }}
              onPointerUp={() => void walk.stopListening()}
              onPointerCancel={() => void walk.stopListening()}
              onContextMenu={(e) => e.preventDefault()}
              disabled={walk.voice === "transcribing" || walk.voice === "thinking"}
              aria-label={t(lang, "holdToAsk")}
              className="flex w-28 select-none flex-col items-center gap-1 pb-1 text-xs font-bold disabled:opacity-60"
              style={{ touchAction: "none" }}
            >
              <span
                className={`-mt-7 grid h-20 w-20 place-items-center rounded-full bg-ink text-white ring-4 ring-surface transition-transform ${walk.voice === "listening" ? "scale-110 shadow-[0_0_0_8px_rgba(255,210,63,0.9)]" : ""}`}
              >
                <Mic size={32} aria-hidden />
              </span>
              {micLabel}
            </button>
            <button
              type="button"
              onClick={() => {
                unlockAudio();
                fileRef.current?.click();
              }}
              className="flex w-20 flex-col items-center gap-1 pb-1 text-xs font-semibold"
            >
              <span className="grid h-12 w-12 place-items-center rounded-full bg-bg">
                <Camera size={22} aria-hidden />
              </span>
              {t(lang, "photo")}
            </button>
          </div>
        </div>
      ) : null}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) setPhotoFile(f);
        }}
      />

      <MiniPlayer session={session} lang={lang} bottom={barBottom} />
      <DiscoverySheet session={session} lang={lang} readOnly={embedded} onSaveFailed={() => flash(t(lang, "storageFull"))} />

      {photoFile ? <PhotoView key={photoFile.name + photoFile.lastModified + photoFile.size} file={photoFile} profile={profile} lang={lang} session={session} fix={walk.fix} onClose={() => setPhotoFile(null)} /> : null}

      <Sheet open={panel === "type"} title={t(lang, "typeTitle")} lang={lang} onClose={() => setPanel(null)}>
        <form onSubmit={submitQuestion} className="flex items-center gap-2 pb-2">
          <input
            autoFocus
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t(lang, "typePlaceholder")}
            aria-label={t(lang, "typeTitle")}
            className="h-14 min-w-0 flex-1 rounded-full border border-line bg-bg px-5 text-base outline-none focus:border-ink"
          />
          <button type="submit" disabled={!question.trim()} aria-label={t(lang, "send")} className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-ink text-white disabled:opacity-40">
            <Send size={20} aria-hidden />
          </button>
        </form>
      </Sheet>
      <Sheet open={panel === "trace"} title={t(lang, "guideThinking")} lang={lang} onClose={() => setPanel(null)}>
        <TracePanel steps={walk.trace} lang={lang} />
      </Sheet>
      <Sheet open={panel === "heard"} title={t(lang, "heardTodayTitle")} lang={lang} onClose={() => setPanel(null)}>
        {session.heardToday.length === 0 ? (
          <p className="py-6 text-center text-sm text-sub">{t(lang, "heardEmpty")}</p>
        ) : (
          <ul className="space-y-2 pb-2">
            {session.heardToday.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => {
                    setPanel(null);
                    session.replay(d);
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl bg-bg p-2.5 text-left"
                >
                  <StickerArt discovery={d} size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{d.narration.title}</span>
                    <span className="block text-xs text-sub">{new Date(d.at).toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" })}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </div>
  );
}
