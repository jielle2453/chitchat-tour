"use client";
import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { countryName, COUNTRIES, t, UI_LANGS } from "@/lib/client/i18n";
import { useProfile } from "@/lib/client/storage";
import type { Lang } from "@/lib/types";

export default function OnboardingPage() {
  const router = useRouter();
  const { profile, setProfile } = useProfile();
  const [lang, setLang] = useState<Lang>(profile.lang);
  const [home, setHome] = useState(profile.hometown);
  const countries = useMemo(() => [...COUNTRIES], []);

  function go() {
    setProfile({ lang, hometown: home });
    router.replace("/");
  }

  return (
    <div className="rg-scroll flex h-full flex-col px-6 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(32px,env(safe-area-inset-top))]">
      <div className="flex-1 space-y-8">
        <header className="space-y-3">
          {/* slot for a sticker/illustration */}
          <div aria-hidden className="grid h-20 w-20 -rotate-6 place-items-center rounded-[22px] border-[5px] border-white bg-accent text-4xl font-extrabold shadow-[0_0_0_2px_#111]">
            ?
          </div>
          <h1 className="pt-2 text-[28px] font-bold leading-tight">{t(lang, "onbTitle")}</h1>
          <p className="text-base text-sub">{t(lang, "onbSub")}</p>
        </header>

        <section aria-labelledby="lang-h" className="space-y-3">
          <h2 id="lang-h" className="text-sm font-semibold text-sub">
            {t(lang, "onbLang")}
          </h2>
          <div className="flex flex-wrap gap-2">
            {UI_LANGS.map((l) => (
              <button
                key={l.code}
                type="button"
                aria-pressed={lang === l.code}
                onClick={() => setLang(l.code)}
                className={`h-12 rounded-full px-5 text-base font-semibold ${lang === l.code ? "bg-ink text-white" : "bg-surface text-ink ring-1 ring-line"}`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </section>

        <section aria-labelledby="from-h" className="space-y-3">
          <h2 id="from-h" className="text-sm font-semibold text-sub">
            {t(lang, "onbFrom")}
          </h2>
          <div className="relative">
            <select
              value={home}
              onChange={(e) => setHome(e.target.value)}
              aria-labelledby="from-h"
              className="h-14 w-full appearance-none rounded-2xl bg-surface px-4 pr-11 text-base ring-1 ring-line"
            >
              <option value="">{t(lang, "preferNot")}</option>
              {countries.map((c) => (
                <option key={c} value={c}>
                  {countryName(c, lang)}
                </option>
              ))}
            </select>
            <ChevronDown size={18} aria-hidden className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sub" />
          </div>
          <p className="text-sm text-sub">{t(lang, "onbFromHint")}</p>
        </section>
      </div>
      <button type="button" onClick={go} className="mt-8 h-16 w-full rounded-full bg-ink text-lg font-bold text-white">
        {t(lang, "onbStart")}
      </button>
    </div>
  );
}
