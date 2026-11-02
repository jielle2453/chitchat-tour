import { afterEach, describe, expect, it } from "vitest";
import type { Narration } from "@/lib/types";
import { buildCardPrompt, generateCard } from "./index";

const narration: Narration = {
  id: "n1",
  itemId: null,
  title: "Scooter waiting box",
  text: "x",
  lang: "en",
  sources: [],
  confidence: "high",
};

describe("cards", () => {
  const saved = process.env.META_API_KEY;
  afterEach(() => {
    if (saved === undefined) delete process.env.META_API_KEY;
    else process.env.META_API_KEY = saved;
  });

  it("mock mode returns an SVG data URL with the title initial", async () => {
    delete process.env.META_API_KEY;
    const { imageDataUrl } = await generateCard({ profile: { hometown: "JP", lang: "en" }, narration });
    expect(imageDataUrl.startsWith("data:image/svg+xml;base64,")).toBe(true);
    const svg = Buffer.from(imageDataUrl.split(",")[1], "base64").toString("utf8");
    expect(svg).toContain(">S</text>");
    expect(svg).toContain("#C8551F");
  });

  it("prompt forbids text in the image", () => {
    expect(buildCardPrompt(narration)).toMatch(/no text/i);
  });
});
