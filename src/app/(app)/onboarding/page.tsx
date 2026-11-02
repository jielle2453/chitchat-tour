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
      <div className="flex-1 space-y-7">
        <header className="space-y-2.5">
          {/* slot for a sticker/illustration */}
          <div aria-hidden className="grid h-16 w-16 -rotate-6 place-items-center rounded-[20px] border-4 border-white bg-fill text-3xl font-extrabold shadow-[0_0_0_2px_#111]">
            ?
          </div>
          <h1 className="pt-1.5 text-[26px] font-semibold leading-tight">{t(lang, "onbTitle")}</h1>
          <p className="text-[15px] leading-relaxed text-sub">{t(lang, "onbSub")}</p>
        </header>

        <section aria-labelledby="lang-h" className="space-y-2.5">
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
        </section>

        <section aria-labelledby="from-h" className="space-y-2.5">
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
        </section>
      </div>
      <button type="button" onClick={go} className="mt-8 h-12 w-full rounded-full bg-ink text-[15px] font-semibold text-white">
        {t(lang, "onbStart")}
      </button>
    </div>
  );
}
