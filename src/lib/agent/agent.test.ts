import { beforeEach, describe, expect, it, vi } from "vitest";
import { fix, items } from "./fixtures";
import type { GuideRequest } from "@/lib/types";

vi.mock("@/lib/kb", () => ({
  getKnowledgeItems: () => items,
  getItem: (id: string) => items.find((i) => i.id === id),
}));
const responsesText = vi.fn();
vi.mock("./llm", () => ({ responsesText: (...a: unknown[]) => responsesText(...a), chatText: vi.fn() }));

import { runGuide } from "./guide";
import { runAsk, runExplain } from "./ask";
import { allowRequest, resetGuard } from "./guard";

const base = (over: Partial<GuideRequest> = {}): GuideRequest => ({
  profile: { hometown: "JP", lang: "ja" },
  fix,
  candidates: [{ itemId: "garbage-truck", score: 0.9, reasons: ["evening", "differs from Tokyo"], distanceM: 20, bearingDeg: 90 }],
  state: { toldItemIds: [], lastSpokenAt: null, history: [] },
  areaName: "Yongkang Street",
  ...over,
});

beforeEach(() => {
  delete process.env.META_API_KEY;
  responsesText.mockReset();
});

describe("runGuide (mock)", () => {
  it("speaks the top candidate with KB sources, falling back to English when ja is missing", async () => {
    const r = await runGuide(base());
    expect(r.narration?.itemId).toBe("garbage-truck");
    expect(r.narration?.sources[0].url).toContain("taiwaninsight");
    expect(r.narration?.lang).toBe("en");
    expect(r.narration?.text).toContain("Tokyo");
    expect(r.trace.some((t) => /using English/.test(t.message))).toBe(true);
    expect(r.trace.map((t) => t.kind)).toEqual(expect.arrayContaining(["position", "candidate", "decision"]));
  });
  it("uses the requested language when complete", async () => {
    const r = await runGuide(base({ profile: { hometown: "US", lang: "zh-TW" } }));
    expect(r.narration?.lang).toBe("zh-TW");
    expect(r.narration?.text).toContain("音樂");
  });
  it("never invents a comparison when none exists", async () => {
    const r = await runGuide(base({ profile: { hometown: "US", lang: "en" } }));
    expect(r.narration?.text).not.toContain("Compared with home");
  });
  it("flags disputed items", async () => {
    const r = await runGuide(base({ profile: { hometown: "US", lang: "en" }, candidates: [{ itemId: "disputed-thing", score: 0.5, reasons: [] }] }));
    expect(r.narration?.text).toContain("several stories");
    expect(r.narration?.confidence).toBe("low");
  });
  it("stays silent with no candidates or only told ones", async () => {
    expect((await runGuide(base({ candidates: [] }))).narration).toBeNull();
    const r = await runGuide(base({ state: { toldItemIds: ["garbage-truck"], lastSpokenAt: null, history: [] } }));
    expect(r.narration).toBeNull();
    expect(r.trace.at(-1)?.kind).toBe("skip");
  });
});

describe("runGuide (real path, mocked model)", () => {
  beforeEach(() => {
    process.env.META_API_KEY = "test";
  });
  it("uses the model text but KB sources", async () => {
    responsesText.mockResolvedValue({
      text: JSON.stringify({ decision: "speak", itemId: "garbage-truck", title: "Garbage truck", text: "Notice the music?", reason: "Differs from Tokyo." }),
    });
    const r = await runGuide(base());
    expect(r.narration?.text).toBe("Notice the music?");
    expect(r.narration?.sources[0].url).toContain("taiwaninsight");
    expect(responsesText.mock.calls[0][0].text.format.strict).toBe(true);
  });
  it("respects a silent decision", async () => {
    responsesText.mockResolvedValue({ text: JSON.stringify({ decision: "silent", itemId: "garbage-truck", title: "", text: "", reason: "Just told something." }) });
    expect((await runGuide(base())).narration).toBeNull();
  });
  it("falls back to the top candidate on bad JSON", async () => {
    responsesText.mockResolvedValue({ text: "not json" });
    const r = await runGuide(base());
    expect(r.narration?.itemId).toBe("garbage-truck");
    expect(r.trace.some((t) => t.kind === "error")).toBe(true);
  });
});

describe("runAsk / runExplain", () => {
  const profile = { hometown: "JP", lang: "en" as const };
  it("mock ask answers from the KB when it matches", async () => {
    const r = await runAsk({ profile, question: "Why do the garbage trucks play music here?", recent: [] });
    expect(r.narration.itemId).toBe("garbage-truck");
    expect(r.narration.sources.length).toBeGreaterThan(0);
  });
  it("mock ask is honestly unsure otherwise", async () => {
    const r = await runAsk({ profile, question: "What is the population of Peru?", recent: [] });
    expect(r.narration.confidence).toBe("low");
    expect(r.narration.sources).toEqual([]);
    expect(r.narration.text).toMatch(/reliable source/);
  });
  it("explain uses the KB item when given", async () => {
    const r = await runExplain({ profile, label: "garbage truck", itemId: "garbage-truck" });
    expect(r.narration.itemId).toBe("garbage-truck");
  });
  it("real ask keeps only trusted citations, else says no source", async () => {
    process.env.META_API_KEY = "test";
    const msg = (urls: string[]) => ({
      text: "Answer.",
      raw: { output: [{ type: "message", content: [{ type: "output_text", text: "Answer.", annotations: urls.map((url) => ({ type: "url_citation", url, title: "t", start_index: 0, end_index: 1 })) }] }] },
    });
    responsesText.mockResolvedValueOnce(msg(["https://blog.example.com/a", "https://en.wikipedia.org/wiki/A"]));
    const ok = await runAsk({ profile, question: "What is a scooter hook turn?", recent: [] });
    expect(ok.narration.sources.map((s) => s.url)).toEqual(["https://en.wikipedia.org/wiki/A"]);
    expect(ok.narration.confidence).toBe("medium");
    expect(responsesText.mock.calls[0][0].max_tool_calls).toBeGreaterThan(0);

    responsesText.mockResolvedValueOnce(msg(["https://blog.example.com/a"]));
    const bad = await runAsk({ profile, question: "What is a scooter hook turn?", recent: [] });
    expect(bad.narration.confidence).toBe("low");
    expect(bad.narration.sources).toEqual([]);
  });
});

describe("guard", () => {
  it("limits requests per day", () => {
    resetGuard();
    process.env.DAILY_REQUEST_LIMIT = "2";
    expect([allowRequest(), allowRequest(), allowRequest()]).toEqual([true, true, false]);
    delete process.env.DAILY_REQUEST_LIMIT;
    resetGuard();
  });
});
