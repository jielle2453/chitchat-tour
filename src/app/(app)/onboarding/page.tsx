"use client";
import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { countryName, COUNTRIES, t, UI_LANGS } from "@/lib/client/i18n";
import { WORDMARK_POOLS, pickWordmarkSwap, withoutPoolImage } from "@/lib/client/wordmarkSwap";
import { fillNotebookWithSampleWalk, removeSampleWalks } from "@/lib/client/demoSeed";
import { resolveOnboardingRouteId } from "@/lib/client/onboarding";
import { useProfile, useSettings } from "@/lib/client/storage";
import { listRoutes } from "@/lib/geo";
import type { Lang } from "@/lib/types";

function availableRouteIds(): string[] {
  try {
    return listRoutes().map((r) => r.id);
  } catch {
    return [];
  }
}

// Hero wordmark: CHITCHAT / TOUR as cut-out letter stickers, ransom-note
// style. Every repeated letter is a different sticker; C/H/T/A positions
// periodically re-paste from their pools (see wordmarkSwap.ts).
const LINE1 = [
  { name: "letter-c1", ch: "C", rot: -8, y: 3 },
  { name: "letter-h1", ch: "H", rot: 6, y: -4 },
  { name: "letter-i", ch: "I", rot: -5, y: 4 },
  { name: "letter-t1", ch: "T", rot: 8, y: -3 },
  { name: "letter-c2", ch: "C", rot: -7, y: 4 },
  { name: "letter-h2", ch: "H", rot: 5, y: -4 },
  { name: "letter-a", ch: "A", rot: -6, y: 3 },
  { name: "letter-t2", ch: "T", rot: 7, y: -2 },
];
const LINE2 = [
  { name: "letter-t3", ch: "T", rot: 6, y: 0 },
  { name: "letter-o", ch: "O", rot: -7, y: -3 },
  { name: "letter-u", ch: "U", rot: 5, y: 3 },
  { name: "letter-r", ch: "R", rot: -6, y: -2 },
];
const LETTER_SIZE = 48;
const STEP = 0.08;
// Pre-cut transparent stickers (exported from the browser die-cut), so nothing flashes white.
const cutSrc = (name: string) => `/start/cut/${name}.webp`;

function WordmarkLetter({
  name,
  ch,
  rot,
  y,
  delay,
}: {
  name: string;
  ch: string;
  rot: number;
  y: number;
  delay: number;
}) {
  const [deadName, setDeadName] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const img = new Image();
    img.onerror = () => {
      if (alive) setDeadName(name);
    };
    img.src = cutSrc(name);
    return () => {
      alive = false;
    };
  }, [name]);
  const dead = deadName === name;
  return (
    <span
      className="rg-slap -mx-[3px]"
      style={{ ["--rot" as string]: `${rot}deg`, animationDelay: `${delay}s`, marginTop: y }}
    >
      {dead ? (
        <span
          className="grid place-items-center text-[40px] font-extrabold leading-none"
          style={{ width: LETTER_SIZE, height: LETTER_SIZE }}
        >
          {ch}
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cutSrc(name)} alt="" draggable={false} width={LETTER_SIZE} height={LETTER_SIZE} className="block object-contain" style={{ width: LETTER_SIZE, height: LETTER_SIZE }} />
      )}
    </span>
  );
}

const SWAP_EVERY_MS = 1200;
const SWAPS_PER_TICK = [4, 5]; // letters re-pasted per tick, popping in quick succession
// Last staggered slap-in delay + slap duration (0.3s, see .rg-slap) + margin.
const SWAP_START_MS = (LINE1.length + LINE2.length - 1) * STEP * 1000 + 600;

function randomRot(): number {
  const sign = Math.random() < 0.5 ? -1 : 1;
  return sign * (4 + Math.floor(Math.random() * 5));
}

interface SlotState {
  name: string;
  ch: string;
  rot: number;
  y: number;
  delay: number;
  slaps: number; // bump to remount and replay .rg-slap
}

function Wordmark() {
  const [slots, setSlots] = useState<SlotState[]>(() =>
    [...LINE1, ...LINE2].map((l, i) => ({ ...l, delay: i * STEP, slaps: 0 })),
  );
  const [pools, setPools] = useState<Record<string, string[]>>(WORDMARK_POOLS);
  const slotsRef = useRef(slots);
  const poolsRef = useRef(pools);
  const lastPicked = useRef<number | null>(null);
  useEffect(() => {
    slotsRef.current = slots;
    poolsRef.current = pools;
  });

  // Preload every pool image so a swap never flashes. Failures leave the pool.
  useEffect(() => {
    let alive = true;
    for (const name of new Set(Object.values(WORDMARK_POOLS).flat())) {
      const img = new Image();
      img.onerror = () => {
        if (alive) setPools((p) => withoutPoolImage(p, name));
      };
      img.src = cutSrc(name);
    }
    return () => {
      alive = false;
    };
  }, []);

  // Re-paste 4-5 random letters every ~1.2s. Pauses while hidden.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const tick = () => {
      if (document.visibilityState === "hidden") return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const n = SWAPS_PER_TICK[Math.floor(Math.random() * SWAPS_PER_TICK.length)];
      const work = slotsRef.current.map((s) => ({ ...s }));
      const steps: { index: number; slot: SlotState; partner?: { index: number; slot: SlotState } }[] = [];
      const touched = new Set<number>();
      for (let k = 0, tries = 0; k < n && tries < n * 4; tries++) {
        const swap = pickWordmarkSwap(work, poolsRef.current, lastPicked.current);
        if (!swap) break;
        if (touched.has(swap.index) || (swap.partner && touched.has(swap.partner.index))) continue;
        lastPicked.current = swap.index;
        touched.add(swap.index);
        const hit = work[swap.index];
        work[swap.index] = { ...hit, name: swap.name, rot: randomRot(), delay: 0, slaps: hit.slaps + 1 };
        const step: (typeof steps)[number] = { index: swap.index, slot: work[swap.index] };
        if (swap.partner) {
          touched.add(swap.partner.index);
          work[swap.partner.index] = { ...work[swap.partner.index], name: swap.partner.name };
          step.partner = { index: swap.partner.index, slot: work[swap.partner.index] };
        }
        steps.push(step);
        k++;
      }
      // one after another, each pasted the moment its turn comes (no blank wait)
      steps.forEach((st, k) => {
        pending.push(
          window.setTimeout(() => {
            setSlots((prev) => {
              const out = [...prev];
              out[st.index] = st.slot;
              if (st.partner) out[st.partner.index] = st.partner.slot;
              return out;
            });
          }, k * 25),
        );
      });
    };
    let iv = 0;
    const pending: number[] = [];
    const start = window.setTimeout(() => {
      tick();
      iv = window.setInterval(tick, SWAP_EVERY_MS);
    }, SWAP_START_MS);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(iv);
      pending.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const line1 = slots.slice(0, LINE1.length);
  const line2 = slots.slice(LINE1.length);
  return (
    <>
      <div aria-hidden className="flex justify-center">
        {line1.map((s, i) => (
          <WordmarkLetter key={`${i}-${s.slaps}`} name={s.name} ch={s.ch} rot={s.rot} y={s.y} delay={s.delay} />
        ))}
      </div>
      <div aria-hidden className="mt-3 flex justify-center">
        {line2.map((s, i) => (
          <WordmarkLetter
            key={`${LINE1.length + i}-${s.slaps}`}
            name={s.name}
            ch={s.ch}
            rot={s.rot}
            y={s.y}
            delay={s.delay}
          />
        ))}
      </div>
    </>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const { profile, setProfile } = useProfile();
  const [settings, updateSettings] = useSettings();
  // Null until the user changes it, so the stored profile (read after hydration) shows through.
  const [langPick, setLang] = useState<Lang | null>(null);
  const [homePick, setHome] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const lang = langPick ?? profile.lang;
  const home = homePick ?? profile.hometown;
  const countries = useMemo(() => [...COUNTRIES], []);
  const routeIds = useMemo(() => availableRouteIds(), []);

  const [busy, setBusy] = useState(false);

  // The simulated entry comes with sample walks in the notebook; the real one without.
  async function go(simulated: boolean) {
    if (busy) return;
    setBusy(true);
    // The simulated walk is a demo for visitors from anywhere: it runs in English.
    setProfile({ lang: simulated ? "en" : lang, hometown: home });
    if (simulated) {
      updateSettings({ demo: true, routeId: resolveOnboardingRouteId(settings.routeId, routeIds) });
      await fillNotebookWithSampleWalk({ lang: "en", hometown: home }).catch(() => 0);
    } else {
      updateSettings({ demo: false });
      removeSampleWalks();
    }
    router.replace("/");
  }

  return (
    <div className="rg-scroll relative flex h-full flex-col justify-center px-6 pb-[max(48px,calc(env(safe-area-inset-bottom)+24px))] pt-[max(32px,env(safe-area-inset-top))]">
      <header className="flex flex-col items-center">
        <h1 className="mb-9 flex items-center gap-3 text-[20px] font-semibold tracking-tight">
          <span aria-hidden className="h-px w-7 bg-ink" />
          {t(lang, "appName")}
          <span aria-hidden className="h-px w-7 bg-ink" />
        </h1>
        <Wordmark />
        <p className="mt-9 text-center text-[15px] leading-relaxed text-sub">{t(lang, "onbTagline")}</p>
      </header>

      <div className="mt-9 flex flex-col gap-4 px-6">
        {expanded ? (
          <section aria-label={t(lang, "onbReal")} className="space-y-4 rounded-3xl bg-surface p-4 ring-1 ring-line">
            <div className="space-y-2.5">
              <h2 id="lang-h" className="text-[13px] font-medium text-sub">
                {t(lang, "onbLang")}
              </h2>
              <div className="flex flex-wrap gap-2">
                {UI_LANGS.map((l) => (
                  <button
                    key={l.code}
                    type="button"
                    aria-pressed={lang === l.code}
                    onClick={() => setLang(l.code)}
                    className={`h-10 rounded-full px-4 text-[15px] font-medium ${lang === l.code ? "bg-ink text-white" : "bg-surface text-ink ring-1 ring-line"}`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2.5">
              <h2 id="from-h" className="text-[13px] font-medium text-sub">
                {t(lang, "onbFrom")}
              </h2>
              <div className="relative">
                <select
                  value={home}
                  onChange={(e) => setHome(e.target.value)}
                  aria-labelledby="from-h"
                  className="h-12 w-full appearance-none rounded-xl bg-surface px-3.5 pr-10 text-[15px] ring-1 ring-line"
                >
                  <option value="">{t(lang, "preferNot")}</option>
                  {countries.map((c) => (
                    <option key={c} value={c}>
                      {countryName(c, lang)}
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} aria-hidden className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sub" />
              </div>
              <p className="text-[13px] text-sub">{t(lang, "onbFromHint")}</p>
            </div>
            <button
              type="button"
              onClick={() => go(false)}
              className="h-12 w-full rounded-full bg-ink text-[15px] font-semibold text-white"
            >
              {t(lang, "nbEmptyGo")}
            </button>
          </section>
        ) : (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-expanded={expanded}
            className="h-14 w-full rounded-full bg-ink text-[15px] font-semibold text-white"
          >
            {t(lang, "onbReal")}
          </button>
        )}
        <button
          type="button"
          onClick={() => go(true)}
          className="flex h-16 w-full flex-col items-center justify-center gap-1 rounded-full bg-surface text-ink ring-1 ring-line"
        >
          <span className="text-[15px] font-semibold leading-tight">{t(lang, "onbSimTitle")}</span>
          <span className="text-[12px] leading-tight text-sub">{t(lang, "onbSimSub")}</span>
        </button>
      </div>
      <p className="absolute inset-x-0 bottom-[max(20px,env(safe-area-inset-bottom))] text-center text-[12px] text-sub">{t(lang, "builtWith")}</p>
    </div>
  );
}
