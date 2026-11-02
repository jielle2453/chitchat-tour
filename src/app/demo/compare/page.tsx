"use client";
import { Pause, Play, RotateCcw, Volume2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import AudioOverlay from "@/components/AudioOverlay";
import { safeRoutes } from "@/components/AppShell";
import { MiniPhone } from "@/components/PhoneFrame";
import WalkScreen from "@/components/WalkScreen";
import { COUNTRIES, countryName, localized, t } from "@/lib/client/i18n";
import { useProfile } from "@/lib/client/storage";
import { useGuideSession } from "@/lib/client/useGuideSession";

const SPEEDS = [1, 2, 4];
const selectCls = "h-11 rounded-full bg-surface px-4 text-sm font-semibold ring-1 ring-line";

export default function ComparePage() {
  const { profile } = useProfile();
  const lang = profile.lang;
  const routes = useMemo(() => safeRoutes(), []);
  const [routeId, setRouteId] = useState<string | null>(null);
  const [homeA, setHomeA] = useState("JP");
  const [homeB, setHomeB] = useState("US");
  const [soundLeft, setSoundLeft] = useState(true);
  const route = routes.find((r) => r.id === routeId) ?? routes[0] ?? null;

  const common = { frequency: "normal" as const, voiceRate: 1, sim: route, persist: false };
  const a = useGuideSession({ ...common, profile: { hometown: homeA, lang }, speak: soundLeft, storageKey: "cmp-a" });
  const b = useGuideSession({ ...common, profile: { hometown: homeB, lang }, speak: !soundLeft, storageKey: "cmp-b" });

  const started = a.active;
  const running = a.simPlaying;
  const countries = useMemo(() => [...COUNTRIES], []);

  function start() {
    a.begin();
    b.begin();
  }
  function reset() {
    a.end();
    b.end();
  }
  function setSpeed(s: number) {
    a.setSimSpeed(s);
    b.setSimSpeed(s);
  }
  function toggle() {
    a.simToggle();
    b.simToggle();
  }

  const picker = (value: string, onChange: (v: string) => void, n: number) => (
    <label className="flex items-center gap-2 text-sm font-semibold text-sub">
      {t(lang, "cmpTraveller", { n })}
      <select disabled={started} value={value} onChange={(e) => onChange(e.target.value)} className={selectCls} aria-label={t(lang, "cmpTraveller", { n })}>
        {countries.map((c) => (
          <option key={c} value={c}>
            {countryName(c, lang)}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col items-center gap-6 px-4 py-8">
      <header className="space-y-2 text-center">
        <h1 className="text-3xl font-bold">{t(lang, "cmpTitle")}</h1>
        <p className="mx-auto max-w-xl text-base text-sub">{t(lang, "cmpSub")}</p>
      </header>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {!started ? (
          <button type="button" onClick={start} disabled={!route} className="h-12 rounded-full bg-ink px-6 font-bold text-white disabled:opacity-40">
            {t(lang, "cmpStart")}
          </button>
        ) : (
          <>
            <button type="button" onClick={toggle} className="flex h-12 items-center gap-2 rounded-full bg-ink px-5 font-bold text-white">
              {running ? <Pause size={16} fill="currentColor" aria-hidden /> : <Play size={16} fill="currentColor" aria-hidden />}
              {running ? t(lang, "cmpPause") : t(lang, "cmpResume")}
            </button>
            <button type="button" onClick={reset} className="flex h-12 items-center gap-2 rounded-full bg-surface px-5 font-semibold ring-1 ring-line">
              <RotateCcw size={16} aria-hidden />
              {t(lang, "cmpReset")}
            </button>
          </>
        )}
        <div role="group" aria-label={t(lang, "cmpSpeed")} className="flex rounded-full bg-surface p-1 ring-1 ring-line">
          {SPEEDS.map((s) => (
            <button key={s} type="button" aria-pressed={a.simSpeed === s} onClick={() => setSpeed(s)} className={`h-9 min-w-10 rounded-full px-3 text-sm font-bold ${a.simSpeed === s ? "bg-accent" : "text-sub"}`}>
              {t(lang, "speedPill", { n: s })}
            </button>
          ))}
        </div>
        <div role="group" aria-label={t(lang, "cmpSound")} className="flex items-center gap-1 rounded-full bg-surface p-1 pl-3 ring-1 ring-line">
          <Volume2 size={16} aria-hidden className="mr-1 text-sub" />
          {[true, false].map((left) => (
            <button key={String(left)} type="button" aria-pressed={soundLeft === left} onClick={() => setSoundLeft(left)} className={`h-9 rounded-full px-3 text-sm font-bold ${soundLeft === left ? "bg-ink text-white" : "text-sub"}`}>
              {t(lang, left ? "cmpLeft" : "cmpRight")}
            </button>
          ))}
        </div>
        {routes.length > 1 ? (
          <select aria-label={t(lang, "cmpRoute")} disabled={started} value={route?.id ?? ""} onChange={(e) => setRouteId(e.target.value)} className={selectCls}>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                {localized(r.name, lang)}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <div className="flex flex-wrap items-start justify-center gap-8">
        <MiniPhone label={picker(homeA, setHomeA, 1)}>
          <WalkScreen session={a} profile={{ hometown: homeA, lang }} lang={lang} route={route} embedded label={t(lang, "cmpFrom", { place: countryName(homeA, lang) })} />
        </MiniPhone>
        <MiniPhone label={picker(homeB, setHomeB, 2)}>
          <WalkScreen session={b} profile={{ hometown: homeB, lang }} lang={lang} route={route} embedded label={t(lang, "cmpFrom", { place: countryName(homeB, lang) })} />
        </MiniPhone>
      </div>

      <Link href="/" className="text-sm font-semibold underline underline-offset-4">
        {t(lang, "cmpOpen")}
      </Link>
      <AudioOverlay lang={lang} />
    </main>
  );
}
