"use client";
import { ChevronRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { safeRoutes } from "@/components/AppShell";
import Sheet from "@/components/Sheet";
import { COUNTRIES, countryName, localized, t, UI_LANGS, type I18nKey } from "@/lib/client/i18n";
import { clearNotebook, useProfile, useSettings } from "@/lib/client/storage";
import type { Frequency } from "@/lib/client/storageFormat";
import type { Lang } from "@/lib/types";

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-sm font-semibold text-sub">{title}</h2>
      <div className="divide-y divide-line overflow-hidden rounded-card bg-surface ring-1 ring-line">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="space-y-2 p-4">
      <div>
        <p className="font-semibold">{label}</p>
        {hint ? <p className="text-sm text-sub">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex rounded-full bg-bg p-1">
      {options.map((o) => (
        <button
          key={String(o.v)}
          type="button"
          aria-pressed={value === o.v}
          onClick={() => onChange(o.v)}
          className={`h-10 flex-1 rounded-full text-sm font-semibold ${value === o.v ? "bg-ink text-white" : "text-sub"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const selectCls = "h-12 w-full rounded-2xl bg-bg px-4 text-base";

export default function MePage() {
  const { profile, setProfile } = useProfile();
  const [settings, update] = useSettings();
  const lang: Lang = profile.lang;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cleared, setCleared] = useState(false);
  const routes = useMemo(() => safeRoutes(), []);
  const countries = useMemo(() => [...COUNTRIES], []);

  const freq: { v: Frequency; key: I18nKey }[] = [
    { v: "often", key: "freqOften" },
    { v: "normal", key: "freqNormal" },
    { v: "rarely", key: "freqRarely" },
  ];
  const speeds: { v: number; key: I18nKey }[] = [
    { v: 0.85, key: "speedSlow" },
    { v: 1, key: "speedNormal" },
    { v: 1.2, key: "speedFast" },
  ];

  return (
    <div className="rg-scroll h-full space-y-6 px-4 pb-8 pt-[max(20px,env(safe-area-inset-top))]">
      <h1 className="px-1 text-[28px] font-bold">{t(lang, "meTitle")}</h1>

      <Group title={t(lang, "groupGuide")}>
        <Row label={t(lang, "whereFrom")} hint={t(lang, "whereFromHint")}>
          <select aria-label={t(lang, "whereFrom")} className={selectCls} value={profile.hometown} onChange={(e) => setProfile({ ...profile, hometown: e.target.value })}>
            <option value="">{t(lang, "preferNot")}</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {countryName(c, lang)}
              </option>
            ))}
          </select>
        </Row>
        <Row label={t(lang, "language")}>
          <Segmented
            label={t(lang, "language")}
            value={lang === "ko" ? "en" : lang}
            options={UI_LANGS.map((l) => ({ v: l.code, label: l.label }))}
            onChange={(v) => setProfile({ ...profile, lang: v })}
          />
        </Row>
        <Row label={t(lang, "frequency")}>
          <Segmented label={t(lang, "frequency")} value={settings.frequency} options={freq.map((f) => ({ v: f.v, label: t(lang, f.key) }))} onChange={(v) => update({ frequency: v })} />
        </Row>
        <Row label={t(lang, "voiceSpeed")}>
          <Segmented label={t(lang, "voiceSpeed")} value={settings.voiceRate} options={speeds.map((s) => ({ v: s.v, label: t(lang, s.key) }))} onChange={(v) => update({ voiceRate: v })} />
        </Row>
      </Group>

      <Group title={t(lang, "groupPrivacy")}>
        <div className="flex gap-3 p-4">
          <ShieldCheck size={22} aria-hidden className="mt-0.5 shrink-0" />
          <p className="text-sm leading-relaxed">{t(lang, "privacyInfo")}</p>
        </div>
        <div className="p-4">
          <button type="button" onClick={() => setConfirmOpen(true)} className="h-12 w-full rounded-full border border-line text-base font-semibold text-red-700">
            {t(lang, "clearNotebook")}
          </button>
          {cleared ? (
            <p role="status" className="mt-2 text-center text-sm text-sub">
              {t(lang, "clearDone")}
            </p>
          ) : null}
        </div>
      </Group>

      <Group title={t(lang, "groupDemo")}>
        <div className="flex items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{t(lang, "simWalk")}</p>
            <p className="text-sm text-sub">{t(lang, "simWalkHint")}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.demo}
            aria-label={t(lang, "simWalk")}
            onClick={() => update({ demo: !settings.demo })}
            className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${settings.demo ? "bg-ink" : "bg-line"}`}
          >
            <span className={`absolute top-1 h-6 w-6 rounded-full transition-all ${settings.demo ? "left-7 bg-accent" : "left-1 bg-white"}`} />
          </button>
        </div>
        {settings.demo ? (
          <Row label={t(lang, "simRoute")}>
            <select aria-label={t(lang, "simRoute")} className={selectCls} value={settings.routeId ?? routes[0]?.id ?? ""} onChange={(e) => update({ routeId: e.target.value })}>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {localized(r.name, lang)}
                </option>
              ))}
            </select>
          </Row>
        ) : null}
        <Link href="/demo/compare" className="flex min-h-14 items-center justify-between p-4 font-semibold">
          {t(lang, "compareTravellers")}
          <ChevronRight size={18} aria-hidden className="text-sub" />
        </Link>
      </Group>

      <Group title={t(lang, "groupAbout")}>
        {(["aboutOsm", "aboutKb", "aboutMeta"] as const).map((k) => (
          <p key={k} className="p-4 text-sm leading-relaxed text-sub">
            {t(lang, k)}
          </p>
        ))}
      </Group>

      <Sheet open={confirmOpen} title={t(lang, "clearTitle")} lang={lang} onClose={() => setConfirmOpen(false)}>
        <p className="pb-4 text-base text-sub">{t(lang, "clearBody")}</p>
        <div className="flex gap-2 pb-2">
          <button type="button" onClick={() => setConfirmOpen(false)} className="h-12 flex-1 rounded-full border border-line font-semibold">
            {t(lang, "cancel")}
          </button>
          <button
            type="button"
            onClick={() => {
              clearNotebook();
              setConfirmOpen(false);
              setCleared(true);
            }}
            className="h-12 flex-1 rounded-full bg-ink font-semibold text-white"
          >
            {t(lang, "clearConfirm")}
          </button>
        </div>
      </Sheet>
    </div>
  );
}
