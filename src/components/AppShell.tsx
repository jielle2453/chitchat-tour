"use client";
// The phone-app shell: frame, bottom tabs, first-launch redirect, and the one walking session shared by all tabs.
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo } from "react";
import { migrateLegacyStorage, useHydrated, useProfile, useSettings } from "@/lib/client/storage";
import { useGuideSession, type GuideSession } from "@/lib/client/useGuideSession";
import { listRoutes } from "@/lib/geo";
import type { RouteDef } from "@/lib/types";
import AudioOverlay from "./AudioOverlay";
import PhoneFrame from "./PhoneFrame";
import TabBar from "./TabBar";

const SessionContext = createContext<GuideSession | null>(null);

export function useSession(): GuideSession {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useSession must be used inside AppShell");
  return s;
}

export function safeRoutes(): RouteDef[] {
  try {
    return listRoutes();
  } catch {
    return [];
  }
}

export function useSimRoute(): RouteDef | null {
  const [settings] = useSettings();
  const routes = useMemo(() => safeRoutes(), []);
  if (!settings.demo) return null;
  return routes.find((r) => r.id === settings.routeId) ?? routes[0] ?? null;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { profile, hasProfile } = useProfile();
  const [settings] = useSettings();
  const hydrated = useHydrated();
  const path = usePathname();
  const router = useRouter();
  const lang = profile.lang;
  const route = useSimRoute();

  const session = useGuideSession({
    profile,
    frequency: settings.frequency,
    voiceRate: settings.voiceRate,
    speak: true,
    sim: route,
    persist: true,
    storageKey: "walk",
  });

  useEffect(() => {
    migrateLegacyStorage();
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const onboarding = path === "/onboarding";
  useEffect(() => {
    if (hydrated && !hasProfile && !onboarding) router.replace("/onboarding");
  }, [hydrated, hasProfile, onboarding, router]);

  return (
    <SessionContext.Provider value={session}>
      <PhoneFrame>
        <main className="relative min-h-0 flex-1">{children}</main>
        {onboarding ? null : <TabBar lang={lang} />}
      </PhoneFrame>
      <AudioOverlay lang={lang} />
    </SessionContext.Provider>
  );
}
