import { describe, expect, it } from "vitest";
import type { GeoFix, KnowledgeItem, UserProfile, WalkState } from "@/lib/types";
import { emptyWalkState, rankCandidates, shouldSpeak } from "@/lib/trigger";
import { sanitizeQuietS } from "./storageFormat";
import { AREA_IDLE_MS, NATIONAL_IDLE_MS, simTriggerConfig, triggerConfig } from "./useGuideSession";
import { applyGuideEnd, applyGuideStart } from "./useWalk";

const NOON = Date.UTC(2026, 0, 0, 4, 0, 0);
const fix: GeoFix = { lat: 25.033, lon: 121.53, accuracy: 10, heading: 0, speed: 1.2, timestamp: NOON };
const profile: UserProfile = { hometown: "JP", lang: "en" };
const src = [{ url: "https://example.org/a", title: "A" }];

function layerItem(id: string, layer: KnowledgeItem["layer"]): KnowledgeItem {
  return {
    id, category: "shop", layer,
    trigger: { osm: [] },
    title: { en: id }, fact: { en: id },
    sources: src, confidence: "high", disputed: false, caveats: null,
    hometown: {},
  };
}

const rankIdle = (items: KnowledgeItem[], state: WalkState, now: number) =>
  rankCandidates({ fix, profile, pois: [], items, state, now, cfg: triggerConfig(15) });

describe("triggerConfig", () => {
  it("maps quiet seconds to the cooldown with fixed filler thresholds", () => {
    expect(triggerConfig(15)).toEqual({ cooldownMs: 15_000, maxCandidates: 5, nationalItemIdleMs: 240_000, areaItemIdleMs: 120_000 });
    expect(triggerConfig(5).cooldownMs).toBe(5_000);
    expect(triggerConfig(120).cooldownMs).toBe(120_000);
    expect(AREA_IDLE_MS).toBe(120_000);
    expect(NATIONAL_IDLE_MS).toBe(240_000);
  });
  it("falls back to the default when the value is garbage", () => {
    expect(triggerConfig(NaN).cooldownMs).toBe(15_000);
    expect(sanitizeQuietS(undefined)).toBe(15);
  });
  it("keeps simulated walks on a short fixed quiet", () => {
    expect(simTriggerConfig(15).cooldownMs).toBe(10_000);
    expect(simTriggerConfig(120).cooldownMs).toBe(10_000);
    expect(simTriggerConfig(5).cooldownMs).toBe(5_000);
  });
});

describe("cooldown counts from the end of a narration", () => {
  const start = NOON;
  const end = NOON + 30_000; // a 30 s story
  const cfg = triggerConfig(15);
  const stateAtEnd = applyGuideEnd(applyGuideStart(emptyWalkState(), "story-x", start), end);

  it("moves the stamp from delivery to playback end", () => {
    const delivered = applyGuideStart(emptyWalkState(), "story-x", start);
    expect(delivered.lastSpokenAt).toBe(start);
    expect(delivered.toldItemIds).toEqual(["story-x"]);
    expect(delivered.history).toEqual([{ itemId: "story-x", at: start }]);
    const ended = applyGuideEnd(delivered, end);
    expect(ended.lastSpokenAt).toBe(end);
    expect(ended.toldItemIds).toEqual(["story-x"]);
    expect(ended.history).toEqual([{ itemId: "story-x", at: start }]);
  });

  it("stays quiet for the full gap after the end, not the start", () => {
    // Start-to-start would allow speaking here (45 s after delivery); end-to-start must not.
    expect(shouldSpeak(stateAtEnd, start + 15_000, cfg)).toBe(false);
    expect(shouldSpeak(stateAtEnd, end + 15_000 - 1, cfg)).toBe(false);
    expect(shouldSpeak(stateAtEnd, end + 15_000, cfg)).toBe(true);
  });

  it("holds area fillers for 2 min of quiet measured from the end", () => {
    const area = layerItem("area", "area");
    expect(rankIdle([area], stateAtEnd, end + AREA_IDLE_MS - 1)).toHaveLength(0);
    const out = rankIdle([area], stateAtEnd, end + AREA_IDLE_MS);
    expect(out.map((c) => c.itemId)).toEqual(["area"]);
    expect(out[0].reasons.join()).toContain("quiet for a while");
  });

  it("holds national fillers for 4 min of quiet measured from the end", () => {
    const nat = layerItem("nat", "national");
    expect(rankIdle([nat], stateAtEnd, end + NATIONAL_IDLE_MS - 1)).toHaveLength(0);
    const out = rankIdle([nat], stateAtEnd, end + NATIONAL_IDLE_MS);
    expect(out.map((c) => c.itemId)).toEqual(["nat"]);
  });
});
