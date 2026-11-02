"use client";
import { BookOpen, Footprints, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { t, type I18nKey } from "@/lib/client/i18n";
import type { Lang } from "@/lib/types";

const TABS: { href: string; key: I18nKey; Icon: typeof Footprints; match: (p: string) => boolean }[] = [
  { href: "/", key: "tabWalk", Icon: Footprints, match: (p) => p === "/" },
  { href: "/notebook", key: "tabNotebook", Icon: BookOpen, match: (p) => p.startsWith("/notebook") },
  { href: "/me", key: "tabMe", Icon: User, match: (p) => p.startsWith("/me") },
];

export default function TabBar({ lang }: { lang: Lang }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="relative z-20 flex shrink-0 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
      {TABS.map(({ href, key, Icon, match }) => {
        const on = match(path);
        return (
          <Link
            key={href}
            href={href}
            aria-current={on ? "page" : undefined}
            className={`flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-xs font-semibold ${on ? "text-ink" : "text-sub"}`}
          >
            <span className={`grid h-7 w-14 place-items-center rounded-full ${on ? "bg-accent" : ""}`}>
              <Icon size={20} strokeWidth={on ? 2.4 : 2} aria-hidden />
            </span>
            {t(lang, key)}
          </Link>
        );
      })}
    </nav>
  );
}
