import { describe, expect, it } from "vitest";
import { ASK_ACK_DELAY_MS, pickAskAck } from "./askAck";

describe("pickAskAck", () => {
  it("returns a cue in the user's language, including Korean", () => {
    expect(pickAskAck("en", 0)).toBe("Good question, let me check a source.");
    expect(pickAskAck("ja", 0)).toBe("いい質問ですね。出典を確認します。");
    expect(pickAskAck("zh-TW", 0)).toBe("好問題，我查一下可靠的來源。");
    expect(pickAskAck("ko", 0)).toBe("좋은 질문이에요. 출처를 확인할게요.");
  });

  it("rotates variants deterministically and wraps around", () => {
    const en = [0, 1, 2, 3].map((seed) => pickAskAck("en", seed));
    expect(new Set(en.slice(0, 3)).size).toBe(3);
    expect(en[3]).toBe(en[0]);
    expect(pickAskAck("ja", -1)).toBe(pickAskAck("ja", 2));
  });

  it("has distinct, non-empty variants for every language", () => {
    for (const lang of ["en", "ja", "zh-TW", "ko"] as const) {
      const variants = [0, 1, 2].map((seed) => pickAskAck(lang, seed));
      expect(variants.every((v) => v.trim().length > 0)).toBe(true);
      expect(new Set(variants).size).toBe(3);
    }
  });

  it("waits briefly before starting so fast answers skip the cue", () => {
    expect(ASK_ACK_DELAY_MS).toBeGreaterThan(0);
    expect(ASK_ACK_DELAY_MS).toBeLessThanOrEqual(1000);
  });
});
