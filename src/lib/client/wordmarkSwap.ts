// Swap logic for the entry-page wordmark (CHITCHAT / TOUR). Letters with
// more than one sticker image periodically re-paste one position with a
// different image; the page remounts that letter so .rg-slap plays again.
// Pure and unit-tested; the component owns timers, preload and motion prefs.

export const WORDMARK_POOLS: Record<string, string[]> = {
  C: ["letter-c1", "letter-c2"],
  H: ["letter-h1", "letter-h2"],
  T: ["letter-t1", "letter-t2", "letter-t3", "letter-t4"],
  A: ["letter-a", "letter-a2"],
  I: ["letter-i", "letter-i2"],
  O: ["letter-o", "letter-o2"],
  U: ["letter-u", "letter-u2"],
  R: ["letter-r", "letter-r2"],
};

export interface WordmarkSlot {
  ch: string;
  name: string;
}

export interface WordmarkSwap {
  index: number; // picked position: remount with the new image + rotation
  name: string;
  // Silent exchange partner for full pools (C/H): takes the picked
  // position's old image without replaying the animation.
  partner?: { index: number; name: string };
}

// Pick one random swappable position (never lastPicked) and a different
// image of the same letter that no other position currently shows.
// Returns null when nothing can swap.
export function pickWordmarkSwap(
  slots: readonly WordmarkSlot[],
  pools: Readonly<Record<string, readonly string[]>>,
  lastPicked: number | null,
  rand: () => number = Math.random,
): WordmarkSwap | null {
  const counts = new Map<string, number>();
  for (const s of slots) counts.set(s.ch, (counts.get(s.ch) ?? 0) + 1);
  const candidates: number[] = [];
  for (let i = 0; i < slots.length; i++) {
    if (i === lastPicked) continue;
    const pool = pools[slots[i].ch];
    if (!pool || pool.length < 2) continue;
    // Uniqueness is only feasible when the pool covers every position.
    if (pool.length < (counts.get(slots[i].ch) ?? 0)) continue;
    candidates.push(i);
  }
  if (candidates.length === 0) return null;
  const index = candidates[Math.floor(rand() * candidates.length)];
  const { ch, name: current } = slots[index];
  const pool = pools[ch];
  const shownElsewhere = new Set<string>();
  slots.forEach((s, i) => {
    if (i !== index && s.ch === ch) shownElsewhere.add(s.name);
  });
  const options = pool.filter((n) => n !== current && !shownElsewhere.has(n));
  if (options.length > 0) {
    return { index, name: options[Math.floor(rand() * options.length)] };
  }
  // Full pool (e.g. C/H): exchange with the position holding the alternative.
  const alt = pool.find((n) => n !== current);
  if (!alt) return null;
  const partner = slots.findIndex((s, i) => i !== index && s.ch === ch && s.name === alt);
  if (partner < 0) return null;
  return { index, name: alt, partner: { index: partner, name: current } };
}

// Drop a failed image from its pool (returns a new object). Letters left
// with fewer images than positions freeze: pickWordmarkSwap skips them.
export function withoutPoolImage(
  pools: Record<string, string[]>,
  name: string,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [ch, pool] of Object.entries(pools)) {
    out[ch] = pool.includes(name) ? pool.filter((n) => n !== name) : pool;
  }
  return out;
}
