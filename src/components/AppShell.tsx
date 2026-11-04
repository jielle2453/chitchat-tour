"use client";
// The phone-app shell: frame, bottom tabs, first-launch redirect, and the one walking session shared by all tabs.
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { migrateLegacyStorage, useHydrated, useProfile, useSettings } from "@/lib/client/storage";
import { playSfx, setMusicWanted, setSoundEnabled } from "@/lib/client/sound";
import { pauseSpeaking, resumeSpeaking } from "@/lib/client/speech";
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
    quietS: settings.quietS,
    voiceRate: settings.voiceRate,
    speak: true,
    sim: route,
    persist: true,
    storageKey: "walk",
  });

  useEffect(() => {
    migrateLegacyStorage();
  }, []);

  // Soft background music everywhere (starts on the first tap), off with the setting.
  useEffect(() => {
    setSoundEnabled(settings.sound);
    setMusicWanted(settings.sound);
  }, [settings.sound]);

  // A light click on every button and link.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest?.("button, a, [role='button'], select, input[type='range']")) playSfx("tap");
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // The simulated walk pauses (voice included) while another tab is open and
  // picks up where it was on coming back to the walk.
  const sessionRef = useRef(session);
  const autoPaused = useRef(false);
  useEffect(() => {
    sessionRef.current = session;
  });
  useEffect(() => {
    const s = sessionRef.current;
    if (!route) return;
    if (path !== "/") {
      if (s.simPlaying) {
        s.simToggle();
        pauseSpeaking();
        autoPaused.current = true;
      }
    } else if (autoPaused.current) {
      autoPaused.current = false;
      resumeSpeaking();
      if (!s.simPlaying) s.simToggle();
    }
  }, [path, route]);

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
