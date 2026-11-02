"use client";
import { BookOpen, Footprints, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { t, type I18nKey } from "@/lib/client/i18n";
import type { Lang } from "@/lib/types";

const TABS: { href: string; key: I18nKey; Icon: typeof Footprints; match: (p: string) => boolean }[] = [
  { href: "/notebook", key: "tabNotebook", Icon: BookOpen, match: (p) => p.startsWith("/notebook") },
  { href: "/", key: "tabWalk", Icon: Footprints, match: (p) => p === "/" },
  { href: "/me", key: "tabMe", Icon: User, match: (p) => p.startsWith("/me") },
];

export default function TabBar({ lang }: { lang: Lang }) {
  const path = usePathname();
  return (
    <nav
      aria-label="Main"
      className="relative z-20 flex shrink-0 border-t border-[rgba(17,17,17,0.06)] bg-white/[0.92] pb-[env(safe-area-inset-bottom)] backdrop-blur-[16px]"
    >
      {TABS.map(({ href, key, Icon, match }) => {
        const on = match(path);
        return (
          <Link
            key={href}
            href={href}
            aria-current={on ? "page" : undefined}
            className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium ${on ? "text-ink" : "text-ink/45"}`}
          >
            <Icon size={22} strokeWidth={1.75} aria-hidden />
            {t(lang, key)}
          </Link>
        );
      })}
    </nav>
  );
}
