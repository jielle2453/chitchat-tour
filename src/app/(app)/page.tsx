"use client";
import WalkScreen from "@/components/WalkScreen";
import { useSession, useSimRoute } from "@/components/AppShell";
import { useProfile } from "@/lib/client/storage";

export default function WalkTab() {
  const session = useSession();
  const route = useSimRoute();
  const { profile } = useProfile();
  return <WalkScreen session={session} profile={profile} lang={profile.lang} route={route} />;
}
