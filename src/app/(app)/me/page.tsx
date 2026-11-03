"use client";
import { ChevronRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { safeRoutes } from "@/components/AppShell";
import Sheet from "@/components/Sheet";
import { fillNotebookWithSampleWalk } from "@/lib/client/demoSeed";
import { COUNTRIES, countryName, localized, t, UI_LANGS, type I18nKey } from "@/lib/client/i18n";
import { clearNotebook, useProfile, useSettings } from "@/lib/client/storage";
import { QUIET_MAX_S, QUIET_MIN_S, QUIET_STEP_S } from "@/lib/client/storageFormat";
import type { Lang } from "@/lib/types";

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h2 className="px-1 text-[13px] font-medium text-sub">{title}</h2>
      <div className="divide-y divide-line overflow-hidden rounded-2xl bg-surface ring-1 ring-line">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="space-y-2 p-3.5">
      <div>
        <p className="text-[15px] font-medium">{label}</p>
        {hint ? <p className="mt-0.5 text-[13px] leading-relaxed text-sub">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex rounded-full bg-fill p-1">
      {options.map((o) => (
        <button
          key={String(o.v)}
          type="button"
          aria-pressed={value === o.v}
          onClick={() => onChange(o.v)}
          className={`h-9 flex-1 rounded-full text-[13px] font-medium ${value === o.v ? "bg-ink text-white" : "text-sub"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function formatQuiet(totalS: number, lang: Lang): string {
  const m = Math.floor(totalS / 60);
  const r = totalS % 60;
  if (lang === "ja") return m === 0 ? `${totalS}秒` : r === 0 ? `${m}分` : `${m}分${r}秒`;
  if (lang === "zh-TW") return m === 0 ? `${totalS} 秒` : r === 0 ? `${m} 分` : `${m} 分 ${r} 秒`;
  return m === 0 ? `${totalS} s` : r === 0 ? `${m} min` : `${m} min ${r} s`;
}

const selectCls = "h-11 w-full rounded-xl bg-fill px-3.5 text-[15px]";

export default function MePage() {
  const { profile, setProfile } = useProfile();
  const [settings, update] = useSettings();
  const lang: Lang = profile.lang;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seeded, setSeeded] = useState(false);
  const routes = useMemo(() => safeRoutes(), []);
  const countries = useMemo(() => [...COUNTRIES], []);

  const speeds: { v: number; key: I18nKey }[] = [
    { v: 0.85, key: "speedSlow" },
    { v: 1, key: "speedNormal" },
    { v: 1.2, key: "speedFast" },
  ];

  return (
    <div className="rg-scroll h-full space-y-5 px-4 pb-8 pt-[max(20px,env(safe-area-inset-top))]">
      <h1 className="px-1 text-[26px] font-semibold leading-tight">{t(lang, "meTitle")}</h1>

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
        <Row label={t(lang, "quietTime")}>
          <div className="flex h-11 items-center gap-3">
            <input
              type="range"
              min={QUIET_MIN_S}
              max={QUIET_MAX_S}
              step={QUIET_STEP_S}
              value={settings.quietS}
              aria-label={t(lang, "quietTime")}
              aria-valuetext={formatQuiet(settings.quietS, lang)}
              onChange={(e) => update({ quietS: Number(e.target.value) })}
              className="h-11 w-full accent-ink"
            />
            <span aria-hidden className="w-28 shrink-0 text-right text-[15px] tabular-nums">
              {formatQuiet(settings.quietS, lang)}
            </span>
          </div>
        </Row>
        <Row label={t(lang, "voiceSpeed")}>
          <Segmented label={t(lang, "voiceSpeed")} value={settings.voiceRate} options={speeds.map((s) => ({ v: s.v, label: t(lang, s.key) }))} onChange={(v) => update({ voiceRate: v })} />
        </Row>
      </Group>

      <Group title={t(lang, "groupPrivacy")}>
        <div className="flex gap-2.5 p-3.5">
          <ShieldCheck size={18} aria-hidden className="mt-0.5 shrink-0 text-sub" />
          <p className="text-[13px] leading-relaxed text-sub">{t(lang, "privacyInfo")}</p>
        </div>
        <div className="p-3.5">
          <button type="button" onClick={() => setConfirmOpen(true)} className="h-11 w-full rounded-full border border-line text-[15px] font-medium text-red-700">
            {t(lang, "clearNotebook")}
          </button>
          {cleared ? (
            <p role="status" className="mt-2 text-center text-[13px] text-sub">
              {t(lang, "clearDone")}
            </p>
          ) : null}
        </div>
      </Group>

      <Group title={t(lang, "groupDemo")}>
        <div className="flex items-center gap-3 p-3.5">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-medium">{t(lang, "simWalk")}</p>
            <p className="mt-0.5 text-[13px] text-sub">{t(lang, "simWalkHint")}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.demo}
            aria-label={t(lang, "simWalk")}
            onClick={() => update({ demo: !settings.demo })}
            className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${settings.demo ? "bg-ink" : "bg-line"}`}
          >
            <span className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-all ${settings.demo ? "left-7" : "left-1"}`} />
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
        <Row label={t(lang, "fillSample")} hint={t(lang, "fillSampleHint")}>
          <button
            type="button"
            disabled={seeding}
            onClick={() => {
              setSeeding(true);
              void fillNotebookWithSampleWalk({ lang, hometown: profile.hometown })
                .then(() => {
                  setSeeded(true);
                  setCleared(false);
                })
                .finally(() => setSeeding(false));
            }}
            className="h-11 w-full rounded-full bg-ink text-[15px] font-medium text-white disabled:opacity-60"
          >
            {t(lang, "fillSample")}
          </button>
          {seeded ? (
            <p role="status" className="text-center text-[13px] text-sub">
              {t(lang, "fillSampleDone")}
            </p>
          ) : null}
        </Row>
        <Link href="/demo/compare" className="flex min-h-12 items-center justify-between p-3.5 text-[15px] font-medium">
          {t(lang, "compareTravellers")}
          <ChevronRight size={16} aria-hidden className="text-sub" />
        </Link>
      </Group>

      <Group title={t(lang, "groupAbout")}>
        {(["aboutOsm", "aboutKb", "aboutMeta"] as const).map((k) => (
          <p key={k} className="p-3.5 text-[13px] leading-relaxed text-sub">
            {t(lang, k)}
          </p>
        ))}
      </Group>

      <Sheet open={confirmOpen} title={t(lang, "clearTitle")} lang={lang} onClose={() => setConfirmOpen(false)}>
        <p className="pb-4 text-[15px] text-sub">{t(lang, "clearBody")}</p>
        <div className="flex gap-2 pb-2">
          <button type="button" onClick={() => setConfirmOpen(false)} className="h-11 flex-1 rounded-full border border-line text-[15px] font-medium">
            {t(lang, "cancel")}
          </button>
          <button
            type="button"
            onClick={() => {
              clearNotebook();
              setConfirmOpen(false);
              setCleared(true);
            }}
            className="h-11 flex-1 rounded-full bg-ink text-[15px] font-medium text-white"
          >
            {t(lang, "clearConfirm")}
          </button>
        </div>
      </Sheet>
    </div>
  );
}
