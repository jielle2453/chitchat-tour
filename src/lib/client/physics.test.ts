import { describe, expect, it } from "vitest";
import { createJarWorld, JAR_DT, JAR_MAX_BODIES, setJarGravity, settleJar, stepJar, wakeJar } from "./physics";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `d-${i}`);

function settleTicks(world: Parameters<typeof stepJar>[0], max: number): number {
  for (let i = 0; i < max; i++) {
    stepJar(world);
    if (world.settled) return i;
  }
  return -1;
}

describe("jar physics", () => {
  it("drops bodies in and settles them inside the jar", () => {
    const world = createJarWorld(340, 300, ids(6), 28);
    expect(world.settled).toBe(false);
    expect(settleTicks(world, 3000)).toBeGreaterThanOrEqual(0);
    for (const b of world.bodies) {
      expect(b.x).toBeGreaterThanOrEqual(b.r - 0.01);
      expect(b.x).toBeLessThanOrEqual(340 - b.r + 0.01);
      expect(b.y).toBeGreaterThanOrEqual(-0.01);
      expect(b.y).toBeLessThanOrEqual(300 - b.r + 0.01);
    }
    // settled worlds skip work
    const snap = world.bodies.map((b) => [b.x, b.y]);
    stepJar(world);
    expect(world.bodies.map((b) => [b.x, b.y])).toEqual(snap);
  });

  it("separates overlapping bodies", () => {
    const world = createJarWorld(340, 300, ids(2), 28);
    world.bodies[0].x = 170;
    world.bodies[0].y = 200;
    world.bodies[1].x = 175;
    world.bodies[1].y = 200;
    for (let i = 0; i < 240; i++) stepJar(world);
    const [a, b] = world.bodies;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.r + b.r - 1);
  });

  it("caps bodies, starts deterministic, and wakes on demand", () => {
    const world = createJarWorld(340, 300, ids(60), 28);
    expect(world.bodies).toHaveLength(JAR_MAX_BODIES);
    const again = createJarWorld(340, 300, ids(60), 28);
    expect(again.bodies.map((b) => [b.x, b.y])).toEqual(world.bodies.map((b) => [b.x, b.y]));
    settleTicks(world, 3000);
    expect(world.settled).toBe(true);
    setJarGravity(world, 400, 1200);
    expect(world.settled).toBe(false);
    settleTicks(world, 3000);
    wakeJar(world);
    expect(world.settled).toBe(false);
    // empty jar is settled from the start
    expect(createJarWorld(340, 300, [], 28).settled).toBe(true);
  });

  it("closes the top: settled bodies rest fully inside the box", () => {
    const world = createJarWorld(340, 300, ids(6), 28);
    settleJar(world, 3000);
    expect(world.settled).toBe(true);
    for (const b of world.bodies) {
      expect(b.y).toBeGreaterThanOrEqual(b.r - 1);
      expect(b.y).toBeLessThanOrEqual(300 - b.r + 1);
    }
  });

  it("lets spawned bodies drop in through the one-way top", () => {
    const world = createJarWorld(340, 300, ids(4), 28);
    // all bodies start above the visible top
    expect(world.bodies.every((b) => b.y < 0)).toBe(true);
    const steps = settleJar(world, 3000);
    expect(steps).toBeGreaterThan(0);
    expect(world.settled).toBe(true);
    for (const b of world.bodies) {
      expect(b.y).toBeGreaterThanOrEqual(-0.01);
      expect(b.y).toBeLessThanOrEqual(300 - b.r + 0.01);
    }
  });

  it("respects rounded corners: centers stay on the rounded path", () => {
    const corner = 40;
    const r = 10;
    const world = createJarWorld(200, 200, ids(9), r, corner);
    settleJar(world, 4000);
    const cr = corner - r; // center-path corner radius
    const minX = r + cr;
    const minY = r + cr;
    const maxX = 200 - r - cr;
    const maxY = 200 - r - cr;
    for (const b of world.bodies) {
      // inside the rect…
      expect(b.x).toBeGreaterThanOrEqual(b.r - 1);
      expect(b.x).toBeLessThanOrEqual(200 - b.r + 1);
      expect(b.y).toBeGreaterThanOrEqual(-1);
      expect(b.y).toBeLessThanOrEqual(200 - b.r + 1);
      // …and outside every corner cut
      for (const [cx, cy] of [
        [minX, minY],
        [maxX, minY],
        [minX, maxY],
        [maxX, maxY],
      ] as Array<[number, number]>) {
        const inX = cx === minX ? b.x < cx : b.x > cx;
        const inY = cy === minY ? b.y < cy : b.y > cy;
        if (inX && inY) {
          expect(Math.hypot(b.x - cx, b.y - cy)).toBeLessThanOrEqual(cr + 1.5);
        }
      }
    }
  });

  it("rests settled bodies on the world floor and inside the side walls", () => {
    const cases: Array<[number, number, number, number]> = [
      // w, h, r, bodies (counts chosen to fit, so nothing piles out the top)
      [340, 300, 28, 9],
      [360, 200, 40, 4],
      [200, 200, 10, 9],
    ];
    for (const [w, h, r, n] of cases) {
      const world = createJarWorld(w, h, ids(n), r, 32);
      settleJar(world, 4000);
      expect(world.settled).toBe(true);
      for (const b of world.bodies) {
        expect(b.y + b.r).toBeLessThanOrEqual(h + 0.01);
        expect(b.x + b.r).toBeLessThanOrEqual(w + 0.01);
        expect(b.x - b.r).toBeGreaterThanOrEqual(-0.01);
      }
    }
  });

  it("staggers spawns in a short band when asked", () => {
    const world = createJarWorld(340, 400, ids(8), 20, 0, 140);
    for (const b of world.bodies) {
      expect(b.y).toBeLessThanOrEqual(-20);
      expect(b.y).toBeGreaterThanOrEqual(-20 - 140);
    }
    settleJar(world, 3000);
    expect(world.settled).toBe(true);
  });

  it("tilted gravity still keeps bodies in the jar", () => {
    const world = createJarWorld(340, 300, ids(8), 26);
    setJarGravity(world, 900, 900);
    for (let i = 0; i < 1200; i++) stepJar(world, JAR_DT);
    for (const b of world.bodies) {
      expect(b.x).toBeGreaterThanOrEqual(-0.5);
      expect(b.x).toBeLessThanOrEqual(340.5);
      expect(b.y).toBeLessThanOrEqual(300.5);
    }
  });
});
