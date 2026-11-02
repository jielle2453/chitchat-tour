import { describe, expect, it } from "vitest";
import { categoryLabel, discoveryEyebrow, isLiveDiscovery } from "./categories";

describe("categories", () => {
  it("detects live discoveries by itemId prefix", () => {
    expect(isLiveDiscovery("live:node/1")).toBe(true);
    expect(isLiveDiscovery("garbage-truck-why-music")).toBe(false);
    expect(isLiveDiscovery(null)).toBe(false);
    expect(isLiveDiscovery(undefined)).toBe(false);
  });

  it("localises every category", () => {
    expect(categoryLabel("zh-TW", "transport")).toBe("交通");
    expect(categoryLabel("zh-TW", "shop")).toBe("店家");
    expect(categoryLabel("zh-TW", "street")).toBe("街道");
    expect(categoryLabel("ja", "daily-life")).toBe("暮らし");
    expect(categoryLabel("en", "architecture")).toBe("Architecture");
    expect(categoryLabel("en", "other")).toBe("Other");
  });

  it("shows just-looked-up for live discoveries instead of other", () => {
    expect(discoveryEyebrow("zh-TW", "guide", { category: "other", itemId: "live:node/1" })).toBe("導覽告訴你的 · 剛查到的");
    expect(discoveryEyebrow("en", "guide", { category: "other", itemId: "live:node/1" })).toBe("Told by the guide · Just looked up");
    expect(discoveryEyebrow("ja", "guide", { category: "other", itemId: "live:node/1" })).toBe("ガイドの話 · いま調べた");
    expect(discoveryEyebrow("zh-TW", "guide", { category: "transport", itemId: "mrt-no-eating" })).toBe("導覽告訴你的 · 交通");
    expect(discoveryEyebrow("zh-TW", "ask", { category: "shop", itemId: null })).toBe("你問的 · 店家");
  });
});
