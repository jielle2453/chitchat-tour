"use client";
import { Brain, Camera, History, Keyboard, LocateFixed, MapPin, Mic, Send, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { unlockAudio } from "@/lib/client/audio";
import { formatDistance, t } from "@/lib/client/i18n";
import { etaMinutes } from "@/lib/client/navEngine";
import { useDestinationWalk } from "@/lib/client/useDestinationWalk";
import { useDetour } from "@/lib/client/useDetour";
import { useNavigation } from "@/lib/client/useNavigation";
import type { GuideSession } from "@/lib/client/useGuideSession";
import { routeToRouteDef } from "@/lib/geo/navigation";
import { areaLabel } from "@/lib/geo";
import type { GeoFix, Lang, RouteDef, UserProfile, WalkRoute } from "@/lib/types";
import demoWalk from "@data/routes/demo-walk.json";
import ArrivalSheet from "./ArrivalSheet";
import DestinationPicker from "./DestinationPicker";
import DetourCard from "./DetourCard";
import DiscoverySheet, { MiniPlayer } from "./DiscoverySheet";
import ModeChoice from "./ModeChoice";
import NavBanner, { arrowForModifier } from "./NavBanner";
import PhotoView from "./PhotoView";
import Sheet from "./Sheet";
import StartCollage from "./StartCollage";
import StickerArt from "./StickerArt";
import TracePanel from "./TracePanel";

const GuideMap = dynamic(() => import("./GuideMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-[#f0f0f2]" />,
});

const SPEEDS: number[] = [1, 2];

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
  const router = useRouter();
  const [follow, setFollow] = useState(true);
  const [recenterKey, setRecenterKey] = useState(0);
  const [panel, setPanel] = useState<null | "type" | "trace" | "heard">(null);
  const [simBackOpen, setSimBackOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  };

  // stories save themselves; say so only when storage refuses one
  const saveFailedAt = session.saveFailedAt;
  const [shownFailAt, setShownFailAt] = useState<number | null>(null);
  if (saveFailedAt && saveFailedAt !== shownFailAt) {
    setShownFailAt(saveFailedAt);
    setToast(t(lang, "storageFull"));
  }
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(id);
  }, [toast]);

  // ---------- walk modes: wander vs destination ----------
  const [modeOpen, setModeOpen] = useState(false);
  // Before a walk starts there is no fix yet: use a one-shot GPS reading, or the
  // start of the simulated route in demo mode, so search and routing have an origin.
  const [gpsFix, setGpsFix] = useState<GeoFix | null>(null);
  const originFix = (): GeoFix | null => {
    const f = session.walk.getFix() ?? gpsFix;
    if (f) return f;
    const start = route?.coordinates[0];
    if (!start) return null;
    return { lat: start[1], lon: start[0], accuracy: 5, heading: null, speed: null, timestamp: Date.now(), simulated: true };
  };
  useEffect(() => {
    if (!modeOpen || route || gpsFix || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setGpsFix({
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          accuracy: p.coords.accuracy,
          heading: null,
          speed: null,
          timestamp: p.timestamp,
        });
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  }, [modeOpen, route, gpsFix]);
  const dest = useDestinationWalk({ lang, getFix: originFix, hometown: profile.hometown });
  const walkingDest = !embedded && session.active && session.destMode && dest.status === "walking";

  const nav = useNavigation({
    route: dest.route,
    resetKey: dest.route,
    destination: dest.destination,
    fix: walk.fix,
    active: walkingDest,
    lang,
    speaking: session.playback.state === "playing" || session.playback.state === "loading",
    onInterrupt: () => session.interruptForCue(),
    onArrived: () => dest.markArrived(),
    onRoute: (r) => {
      dest.replaceRoute(r);
      session.setRouteCorridor(r.coordinates);
    },
    onRerouted: () => flash(t(lang, "navRerouted")),
  });

  const liveEntries = useMemo(
    () => Object.values(session.live ?? {}).map((e) => ({ poi: e.poi, narration: e.narration })),
    [session.live],
  );
  const detour = useDetour({
    entries: liveEntries,
    heardNarrationIds: session.heardToday.map((d) => d.narration.id),
    fix: walk.fix,
    active: !embedded && session.active && !session.destMode,
    canSpeak: session.active && walk.status === "running" && !walk.busy && session.playback.state === "idle",
    lang,
    onTake: (poi) => dest.choosePoi(poi, originFix()),
  });

  // Arriving ends the close-up: stop following and pull back to the whole route.
  const [arrivedFit, setArrivedFit] = useState(0);
  useEffect(() => {
    if (dest.status !== "arrived") return;
    setFollow(false);
    setArrivedFit((k) => k + 1);
  }, [dest.status]);

  // Simulated entry: Start walks the preset Yongkang Street route to a fixed destination.
  const startDemoWalk = () => {
    const d = demoWalk.destination;
    const name = (d.name as Partial<Record<Lang, string>>)[lang] ?? d.name.en;
    const r = demoWalk.route as WalkRoute;
    dest.startPreset({ name, label: "", lat: d.lat, lon: d.lon }, r);
    session.beginDestination(routeToRouteDef(r, name), { name, label: "", lat: d.lat, lon: d.lon });
  };

  const startDestination = () => {
    if (!dest.route || !dest.destination) return;
    const d = dest.destination;
    dest.startWalking();
    session.beginDestination(routeToRouteDef(dest.route, d.name), { name: d.name, label: d.label, lat: d.lat, lon: d.lon });
  };

  const handleEnd = () => {
    session.end();
    dest.reset();
  };

  const handleMapPick = (lat: number, lon: number, name?: string) => {
    if (!dest.pickArmed || dest.status !== "picking") return;
    // Respond to the tap at once: the hook plans instantly, then resolves
    // the closest named places (a tapped place label keeps its own name).
    dest.choosePoint(lat, lon, name ?? t(lang, "destPinName"), originFix(), Boolean(name));
  };

  // The unselected route option, drawn faint under the selected one.
  const altRouteCoords =
    dest.routes && dest.routes.length > 1 ? dest.routes[dest.routeIndex === 0 ? 1 : 0]?.coordinates : undefined;

  // Stories told on this walk: the session's discoveries stamped with its id.
  const walkId = session.currentWalkId();
  const storyCount = walkId ? session.heardToday.filter((d) => d.walkId === walkId).length : 0;
  // The finish card waits for the last story to end, then replaces the player.
  const arrivedOpen = !embedded && dest.status === "arrived" && dest.destination !== null && session.playback.state === "idle";

  // Tapping a "?" pin tells that story now, and stops the map from sliding away.
  const handlePinTap = (pin: { itemId: string; label: string }) => {
    setFollow(false);
    if (session.explaining) return;
    void session.explain({ label: pin.label, itemId: pin.itemId }, undefined, "guide");
  };

  const voiceBusy = walk.voice !== "idle";
  const micLabel =
    walk.voice === "listening" ? t(lang, "listening") : walk.voice === "transcribing" ? t(lang, "transcribing") : walk.voice === "thinking" ? t(lang, "thinking") : t(lang, "holdToAsk");
  const barBottom = embedded ? 12 : 96;

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
      {/* before a walk the collage sits on the map centre: hide the position dot behind it */}
      <div className={`absolute inset-0 isolate z-0 ${!embedded && !session.active ? "rg-hide-me" : ""}`}>
        <GuideMap
          path={session.path}
          fix={walk.fix}
          pins={walk.pins}
          checked={walk.checked}
          routePreview={session.active && !session.destMode ? route?.coordinates : undefined}
          planRoute={dest.status === "idle" ? undefined : dest.route?.coordinates}
          planRouteAlt={dest.status === "idle" ? undefined : altRouteCoords}
          planDoneM={nav.progress?.distanceAlongM ?? 0}
          destination={dest.status === "idle" ? null : dest.destination}
          pickMode={!embedded && dest.pickArmed && dest.status === "picking"}
          onPick={handleMapPick}
          onPinTap={!embedded ? handlePinTap : undefined}
          pickPoint={dest.pickPoint}
          fitKey={dest.previewKey + arrivedFit}
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
        className="absolute left-3 z-10 whitespace-nowrap text-[10px] text-ink/45"
        style={{ bottom: embedded ? 4 : 80 }}
      >
        OpenFreeMap &copy; OpenMapTiles &copy; OpenStreetMap contributors
      </a>

      {/* top status: glass pill, centred; end-walk is a separate pill at top-right */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-center gap-1.5 px-3 pt-[max(10px,env(safe-area-inset-top))]">
        {/* real walks: centred status pill, end-walk at top-right */}
        {embedded || !route ? (
          <div className="relative flex w-full justify-center">
            {embedded || session.active ? (
            <div
              className={`glass pointer-events-auto flex h-9 items-center rounded-[18px] px-[14px] ${!embedded && session.active ? "max-w-[calc(100%-96px)]" : "max-w-full"}`}
            >
              <p className="flex min-w-0 text-[13px] font-semibold text-ink">
                <span className="truncate">{walkingDest && dest.destination ? dest.destination.name : (label ?? areaLabel(walk.area, lang) ?? t(lang, "unknownArea"))}</span>
                <span className="ml-1.5 shrink-0 whitespace-nowrap font-medium text-ink/55">
                  {walkingDest && dest.route
                    ? t(lang, "destEta", { d: formatDistance(nav.remainingM), n: etaMinutes(dest.route, nav.remainingM) })
                    : `${formatDistance(session.distanceM)} · ${t(lang, "nbMetCount", { n: session.heardToday.length })}`}
                </span>
              </p>
            </div>
            ) : null}
            {!embedded && session.active ? (
              <button
                type="button"
                onClick={handleEnd}
                className="glass pointer-events-auto absolute right-0 top-1/2 h-9 shrink-0 -translate-y-1/2 rounded-[18px] px-3.5 text-[13px] font-medium text-ink"
              >
                {t(lang, "endWalk")}
              </button>
            ) : null}
          </div>
        ) : null}
        {/* simulated walk: red tag with speed top-left (tap to change), exit top-right */}
        {!embedded && route ? (
          <div className="flex w-full items-center gap-1.5">
            <div className="flex shrink-0 justify-start">
              <button
                type="button"
                onClick={() => session.setSimSpeed(SPEEDS[(SPEEDS.indexOf(session.simSpeed) + 1) % SPEEDS.length])}
                aria-label={t(lang, "simSpeedLabel", { n: session.simSpeed })}
                className="pointer-events-auto flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-[18px] border-[1.5px] border-[#E5484D] bg-white/90 px-2.5 text-[11px] font-semibold tracking-wide text-[#D93036]"
              >
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#E5484D] motion-safe:animate-pulse" />
                {t(lang, "simBadge")}
                {session.active ? <span className="font-medium">· {t(lang, "speedPill", { n: session.simSpeed })}</span> : null}
              </button>
            </div>
            {session.active ? <div className="flex min-w-0 flex-1 justify-center"><div className="glass pointer-events-auto flex h-9 min-w-0 items-center rounded-[18px] px-[14px]">
            <p className="flex min-w-0 text-[13px] font-semibold text-ink">
              <span className="truncate">{walkingDest && dest.destination ? dest.destination.name : (label ?? areaLabel(walk.area, lang) ?? t(lang, "unknownArea"))}</span>
              <span className="ml-1.5 shrink-0 whitespace-nowrap font-medium text-ink/55">
                {walkingDest && dest.route
                  ? formatDistance(nav.remainingM)
                  : formatDistance(session.distanceM)}
              </span>
            </p>
          </div></div> : <div className="flex-1" />}
            <div className="flex shrink-0 justify-end">
              <button
                type="button"
                onClick={() => setSimBackOpen(true)}
                className="glass pointer-events-auto h-9 shrink-0 rounded-[18px] px-3 text-[13px] font-medium text-ink"
              >
                {t(lang, "simExit")}
              </button>
            </div>
          </div>
        ) : null}
        {walkingDest && nav.cue && !nav.arrived ? (
          <NavBanner lang={lang} text={nav.cue.text} distanceM={nav.cue.distanceM} arrow={arrowForModifier(nav.cue.modifier)} />
        ) : null}
        {walk.error ? (
          <p role="alert" className="glass pointer-events-auto rounded-2xl px-3.5 py-2 text-[13px] text-red-700">
            {walk.error.notReady ? t(lang, "moduleNotReady") : `${t(lang, "error")} ${walk.error.message}`}
          </p>
        ) : null}
        {toast ? (
          <p role="status" className="glass rg-fade-in pointer-events-auto w-fit rounded-full px-3.5 py-1.5 text-[13px] text-ink">
            {toast}
          </p>
        ) : null}
        {(voiceBusy && walk.voice !== "listening") || session.explaining ? (
          <p role="status" className="glass pointer-events-auto w-fit rounded-full px-3.5 py-1.5 text-[13px] text-ink">
            {session.explaining ? (
              t(lang, "explaining")
            ) : walk.voice === "thinking" ? (
              <>
                {t(lang, "checkingSources")}
                <span aria-hidden className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-ink align-middle motion-safe:animate-pulse">

                </span>
              </>
            ) : (
              micLabel
            )}
          </p>
        ) : null}
      </div>

      {/* right tool stack: one vertical glass capsule */}
      <div
        className="glass absolute right-3 z-10 flex w-11 flex-col items-center overflow-hidden rounded-[22px]"
        style={{ bottom: session.current && session.sheet === "mini" ? barBottom + 60 : embedded ? barBottom + 8 : 88 }}
      >
        <button
          type="button"
          onClick={() => setPanel("trace")}
          aria-label={t(lang, "guideThinking")}
          className="grid h-11 w-11 place-items-center text-ink/80 transition-colors active:bg-[rgba(17,17,17,0.06)]"
        >
          <Brain size={18} strokeWidth={1.75} aria-hidden />
        </button>
        <span aria-hidden className="mx-[10px] h-px self-stretch bg-[rgba(17,17,17,0.06)]" />
        <button
          type="button"
          onClick={() => setPanel("heard")}
          aria-label={t(lang, "heardTodayTitle")}
          className="grid h-11 w-11 place-items-center text-ink/80 transition-colors active:bg-[rgba(17,17,17,0.06)]"
        >
          <History size={18} strokeWidth={1.75} aria-hidden />
        </button>
        <span aria-hidden className="mx-[10px] h-px self-stretch bg-[rgba(17,17,17,0.06)]" />
        <button
          type="button"
          onClick={() => {
            setFollow(true);
            setRecenterKey((k) => k + 1);
          }}
          aria-label={t(lang, "recenter")}
          className="grid h-11 w-11 place-items-center text-ink/80 transition-colors active:bg-[rgba(17,17,17,0.06)]"
        >
          <LocateFixed size={18} strokeWidth={1.75} aria-hidden />
        </button>
      </div>

      {/* start button, centred on the map's visible area; hidden once the walk runs or a choice is open */}
      {!embedded && !session.active && !modeOpen && dest.status === "idle" ? (
        <div
          className="pointer-events-none absolute inset-x-0 z-20 flex flex-col items-center justify-center"
          style={{ top: 76, bottom: 88 }}
        >
          <StartCollage label={t(lang, "startWalk")} onStart={() => (route ? startDemoWalk() : setModeOpen(true))} />
        </div>
      ) : null}

      {/* bottom: compact action bar */}
      {!embedded ? (
        <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center px-3 pb-3">
          <div className="glass flex h-16 items-center gap-6 rounded-[32px] px-4">
            <button
              type="button"
              onClick={() => {
                unlockAudio();
                setPanel("type");
              }}
              aria-label={t(lang, "typeAsk")}
              className="grid h-11 w-11 place-items-center rounded-full text-ink/80 transition-colors active:bg-[rgba(17,17,17,0.06)]"
            >
              <Keyboard size={20} aria-hidden />
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
              title={micLabel}
              className="grid h-[52px] w-[52px] select-none place-items-center rounded-full bg-ink text-white transition-transform disabled:opacity-60"
              style={{ touchAction: "none" }}
            >
              <Mic size={22} aria-hidden className={walk.voice === "listening" ? "scale-110" : ""} />
            </button>
            <button
              type="button"
              onClick={() => {
                unlockAudio();
                fileRef.current?.click();
              }}
              aria-label={t(lang, "photo")}
              className="grid h-11 w-11 place-items-center rounded-full text-ink/80 transition-colors active:bg-[rgba(17,17,17,0.06)]"
            >
              <Camera size={20} aria-hidden />
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

      {/* mode choice */}
      {!embedded && modeOpen && !session.active ? (
        <ModeChoice
          lang={lang}
          onWander={() => {
            setModeOpen(false);
            session.begin();
          }}
          onDestination={() => {
            setModeOpen(false);
            dest.open();
          }}
          onClose={() => setModeOpen(false)}
        />
      ) : null}

      {/* while choosing on the map the sheet steps aside so taps reach the map */}
      {!embedded && dest.status === "picking" && dest.pickArmed ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center px-4 pt-[max(16px,env(safe-area-inset-top))]">
          <div className="glass pointer-events-auto flex h-11 items-center gap-2 rounded-full pl-4 pr-1.5 text-[14px] font-medium text-ink">
            <MapPin size={16} aria-hidden />
            {t(lang, "destTapHint")}
            <button
              type="button"
              onClick={() => dest.setPickArmed(false)}
              aria-label={t(lang, "close")}
              className="grid h-8 w-8 place-items-center rounded-full bg-[rgba(17,17,17,0.06)]"
            >
              <X size={14} aria-hidden />
            </button>
          </div>
        </div>
      ) : null}
      {!embedded && (dest.status === "picking" || dest.status === "preview") && !(dest.status === "picking" && dest.pickArmed) ? (
        <DestinationPicker lang={lang} dest={dest} fix={walk.fix ?? originFix()} onClose={() => dest.cancelPick()} onStart={startDestination} />
      ) : null}

      {!embedded && detour.suggestion && session.active && !session.destMode ? (
        <div className="pointer-events-none absolute inset-x-0 z-20 flex justify-center px-6" style={{ bottom: barBottom + 76 }}>
          <DetourCard
            lang={lang}
            name={detour.suggestion.poi.name ?? detour.suggestion.poi.brand ?? detour.suggestion.narration.title}
            distanceM={detour.suggestion.poi.distanceM}
            onTake={detour.take}
            onDismiss={detour.dismiss}
          />
        </div>
      ) : null}

      {arrivedOpen && dest.destination ? (
        <ArrivalSheet
          lang={lang}
          distanceM={session.distanceM}
          storyCount={storyCount}
          destName={dest.destination.name}
          primaryLabel={t(lang, "navArrivedNotebook")}
          secondaryLabel={route ? t(lang, "simReplay") : t(lang, "endWalk")}
          onPrimary={() => {
            const id = session.currentWalkId();
            session.skip();
            handleEnd();
            if (id) router.push("/notebook/walk?id=" + id);
          }}
          onSecondary={() => {
            session.skip();
            handleEnd();
          }}
        />
      ) : null}

      {arrivedOpen ? null : (
        <>
          <MiniPlayer session={session} lang={lang} bottom={barBottom} />
          <DiscoverySheet session={session} lang={lang} readOnly={embedded} />
        </>
      )}

      {photoFile ? <PhotoView key={photoFile.name + photoFile.lastModified + photoFile.size} file={photoFile} profile={profile} lang={lang} session={session} fix={walk.fix} onClose={() => setPhotoFile(null)} /> : null}

      <Sheet open={panel === "type"} title={t(lang, "typeTitle")} lang={lang} onClose={() => setPanel(null)}>
        <form onSubmit={submitQuestion} className="flex items-center gap-2 pb-2">
          <input
            autoFocus
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t(lang, "typePlaceholder")}
            aria-label={t(lang, "typeTitle")}
            className="h-12 min-w-0 flex-1 rounded-full border border-line bg-bg px-4 text-[15px] outline-none focus:border-ink focus:ring-1 focus:ring-ink"
          />
          <button type="submit" disabled={!question.trim()} aria-label={t(lang, "send")} className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-ink text-white disabled:opacity-40">
            <Send size={18} aria-hidden />
          </button>
        </form>
      </Sheet>
      <Sheet open={simBackOpen} title={t(lang, "simBadge")} lang={lang} onClose={() => setSimBackOpen(false)}>
        <p className="pb-4 text-[15px] text-sub">{t(lang, "simBackBody")}</p>
        <div className="flex gap-2 pb-2">
          <button
            type="button"
            onClick={() => {
              setSimBackOpen(false);
              session.skip();
              handleEnd();
            }}
            className="h-11 flex-1 rounded-full border border-line text-[15px] font-medium"
          >
            {t(lang, "simReplay")}
          </button>
          <button
            type="button"
            onClick={() => {
              setSimBackOpen(false);
              handleEnd();
              router.push("/onboarding");
            }}
            className="h-11 flex-1 rounded-full bg-ink text-[15px] font-medium text-white"
          >
            {t(lang, "simBackGo")}
          </button>
        </div>
      </Sheet>
      <Sheet open={panel === "trace"} title={t(lang, "guideThinking")} lang={lang} onClose={() => setPanel(null)}>
        <TracePanel steps={walk.trace} lang={lang} />
      </Sheet>
      <Sheet open={panel === "heard"} title={t(lang, "heardTodayTitle")} lang={lang} onClose={() => setPanel(null)}>
        {session.heardToday.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-sub">{t(lang, "heardEmpty")}</p>
        ) : (
          <ul className="space-y-1.5 pb-2">
            {session.heardToday.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => {
                    setPanel(null);
                    session.replay(d);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-2xl bg-fill/70 p-2 text-left"
                >
                  <StickerArt discovery={d} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{d.narration.title}</span>
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
