"use client";
// Old day links land on the walk that holds the day (newest walk started that
// day), or back on the notebook when nothing matches.
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo } from "react";
import { dayKey } from "@/lib/client/walkPath";
import { useWalks } from "@/lib/client/storage";

function DayRedirect() {
  const date = useSearchParams().get("date") ?? "";
  const walks = useWalks();
  const router = useRouter();
  const target = useMemo(() => {
    const same = walks.filter((w) => dayKey(w.startedAt) === date).sort((a, b) => b.startedAt - a.startedAt);
    return same.length ? `/notebook/walk?id=${encodeURIComponent(same[0].id)}` : "/notebook";
  }, [walks, date]);
  useEffect(() => {
    router.replace(target);
  }, [router, target]);
  return null;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <DayRedirect />
    </Suspense>
  );
}
