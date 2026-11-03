import { describe, expect, it } from "vitest";
import { WORDMARK_POOLS, pickWordmarkSwap, withoutPoolImage, type WordmarkSlot } from "./wordmarkSwap";

// The entry-page wordmark: CHITCHAT / TOUR.
const FULL: WordmarkSlot[] = [
  { ch: "C", name: "letter-c1" },
  { ch: "H", name: "letter-h1" },
  { ch: "I", name: "letter-i" },
  { ch: "T", name: "letter-t1" },
  { ch: "C", name: "letter-c2" },
  { ch: "H", name: "letter-h2" },
  { ch: "A", name: "letter-a" },
  { ch: "T", name: "letter-t2" },
  { ch: "T", name: "letter-t3" },
  { ch: "O", name: "letter-o" },
  { ch: "U", name: "letter-u" },
  { ch: "R", name: "letter-r" },
];

const zero = () => 0;

function apply(slots: WordmarkSlot[], swap: { index: number; name: string; partner?: { index: number; name: string } }) {
  const out = slots.map((s) => ({ ...s }));
  out[swap.index].name = swap.name;
  if (swap.partner) out[swap.partner.index].name = swap.partner.name;
  return out;
}

function duplicates(slots: WordmarkSlot[]): boolean {
  const seen = new Set<string>();
  for (const s of slots) {
    if (seen.has(s.name)) return true;
    seen.add(s.name);
  }
  return false;
}

describe("pickWordmarkSwap", () => {
  it("returns null when no letter has more than one image", () => {
    const slots = [
      { ch: "S", name: "letter-s" },
      { ch: "X", name: "letter-x" },
    ];
    expect(pickWordmarkSwap(slots, WORDMARK_POOLS, null, zero)).toBeNull();
  });

  it("never picks the previously swapped position", () => {
    const slots = [
      { ch: "C", name: "letter-c1" },
      { ch: "C", name: "letter-c2" },
    ];
    // rand 0 would pick index 0, but it was last: index 1 wins.
    expect(pickWordmarkSwap(slots, WORDMARK_POOLS, 0, zero)?.index).toBe(1);
  });

  it("gives a T position the unused T image", () => {
    const slots = [
      { ch: "T", name: "letter-t1" },
      { ch: "T", name: "letter-t2" },
      { ch: "T", name: "letter-t3" },
    ];
    const swap = pickWordmarkSwap(slots, WORDMARK_POOLS, null, zero);
    expect(swap?.index).toBe(0);
    expect(swap?.name).toBe("letter-t4");
  });

  it("exchanges images when a pool is full (C, H)", () => {
    const slots = [
      { ch: "C", name: "letter-c1" },
      { ch: "C", name: "letter-c2" },
    ];
    const swap = pickWordmarkSwap(slots, WORDMARK_POOLS, null, zero);
    expect(swap).toEqual({ index: 0, name: "letter-c2", partner: { index: 1, name: "letter-c1" } });
    expect(duplicates(apply(slots, swap!))).toBe(false);
  });

  it("keeps images unique and positions rotating over many swaps", () => {
    let slots = FULL.map((s) => ({ ...s }));
    let last: number | null = null;
    for (let i = 0; i < 500; i++) {
      const swap = pickWordmarkSwap(slots, WORDMARK_POOLS, last);
      expect(swap).not.toBeNull();
      expect(swap!.index).not.toBe(last);
      // The picked letter always changes to a different image of the same letter.
      expect(swap!.name).not.toBe(slots[swap!.index].name);
      slots = apply(slots, swap!);
      expect(duplicates(slots)).toBe(false);
      last = swap!.index;
    }
  });

  it("freezes a letter whose pool drops to one image", () => {
    const slots = [
      { ch: "C", name: "letter-c1" },
      { ch: "C", name: "letter-c2" },
    ];
    const pools = withoutPoolImage(WORDMARK_POOLS, "letter-c2");
    expect(pools.C).toEqual(["letter-c1"]);
    expect(pickWordmarkSwap(slots, pools, null, zero)).toBeNull();
  });

  it("freezes a letter whose pool is smaller than its position count", () => {
    const slots = [
      { ch: "T", name: "letter-t1" },
      { ch: "T", name: "letter-t2" },
      { ch: "T", name: "letter-t3" },
    ];
    let pools = withoutPoolImage(WORDMARK_POOLS, "letter-t4");
    expect(pickWordmarkSwap(slots, pools, null, zero)).not.toBeNull();
    pools = withoutPoolImage(pools, "letter-t3");
    expect(pickWordmarkSwap(slots, pools, null, zero)).toBeNull();
  });
});
