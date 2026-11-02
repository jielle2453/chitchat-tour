// Tiny 2D circle physics for the theme cells: gravity, rounded-square walls,
// body collisions, rest. Pure and deterministic — the component only renders.
// Fixed timestep (DT); the component calls stepJar() several times a frame.
// The container is a rect with rounded corners (corner = card radius). The
// top edge is one-way: bodies spawned above fall in, bodies inside cannot
// leave through it — so opening a cell reads as "dropping the stickers in".
import { hashSeed, mulberry32 } from "./handDrawn";

export interface JarBody {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number; // px
  rot: number; // resting tilt, degrees
}

export interface JarWorld {
  bodies: JarBody[];
  w: number; // cell interior, px
  h: number;
  corner: number; // container corner radius, px (card radius)
  gx: number; // gravity px/s^2
  gy: number;
  settled: boolean;
  idleTicks: number;
}

export const JAR_MAX_BODIES = 40;
export const JAR_GRAVITY = 1600;
export const JAR_DT = 1 / 120;
const BODY_RESTITUTION = 0.42;
const WALL_RESTITUTION = 0.38;
// Impacts slower than this go fully inelastic — kills perpetual micro-bounces
// so a tall pile actually comes to rest. Real drops hit at hundreds of px/s.
const REST_THRESHOLD = 60;
const AIR_DAMPING = 0.9985; // per tick
const SLEEP_SPEED = 42; // px/s — well above the gravity-per-tick quantum (~13)
const SLEEP_TICKS = 45;

// Bodies start just above the visible top so opening the cell reads as
// "dropping the stickers in". spawnBand > 0 staggers them in a short band
// for a quick fall; 0 stacks them (longer drop). Deterministic per id.
export function createJarWorld(w: number, h: number, ids: string[], radius: number, corner = 0, spawnBand = 0): JarWorld {
  const kept = ids.slice(0, JAR_MAX_BODIES);
  const bodies = kept.map((id, i) => {
    const rand = mulberry32(hashSeed(`jar:${id}`));
    const x = radius + rand() * Math.max(1, w - radius * 2);
    const bandY = -radius - rand() * spawnBand;
    return {
      id,
      x,
      y: spawnBand > 0 ? bandY : -radius - i * radius * 1.15,
      vx: (rand() - 0.5) * 40,
      vy: 0,
      r: radius,
      rot: (rand() - 0.5) * 16,
    };
  });
  return { bodies, w, h, corner, gx: 0, gy: JAR_GRAVITY, settled: bodies.length === 0, idleTicks: 0 };
}

export function setJarGravity(world: JarWorld, gx: number, gy: number): void {
  world.gx = gx;
  world.gy = gy;
  wakeJar(world);
}

export function wakeJar(world: JarWorld): void {
  world.settled = false;
  world.idleTicks = 0;
}

function collideWalls(b: JarBody, world: JarWorld): void {
  if (b.x < b.r) {
    b.x = b.r;
    if (b.vx < 0) b.vx = Math.abs(b.vx) > REST_THRESHOLD ? -b.vx * WALL_RESTITUTION : 0;
    b.vy *= 0.985;
  } else if (b.x > world.w - b.r) {
    b.x = world.w - b.r;
    if (b.vx > 0) b.vx = Math.abs(b.vx) > REST_THRESHOLD ? -b.vx * WALL_RESTITUTION : 0;
    b.vy *= 0.985;
  }
  if (b.y > world.h - b.r) {
    b.y = world.h - b.r;
    if (b.vy > 0) b.vy = b.vy > REST_THRESHOLD ? -b.vy * WALL_RESTITUTION : 0;
    b.vx *= 0.985;
  }
  // One-way ceiling: falling bodies enter freely, bodies inside cannot exit
  // upward. A tossed sticker flies out, arcs, and falls back in.
  if (b.y < b.r && b.y >= 0 && b.vy < 0) {
    b.y = b.r;
    b.vy = Math.abs(b.vy) > REST_THRESHOLD ? -b.vy * WALL_RESTITUTION : 0;
    b.vx *= 0.985;
  }
  // Rounded corners: the center path has corner radius max(0, corner - r).
  const cr = Math.max(0, world.corner - b.r);
  if (cr > 0) {
    const minX = b.r + cr;
    const minY = b.r + cr;
    const maxX = world.w - b.r - cr;
    const maxY = world.h - b.r - cr;
    if (maxX >= minX && maxY >= minY) {
      const corners: Array<[number, number]> = [
        [minX, minY],
        [maxX, minY],
        [minX, maxY],
        [maxX, maxY],
      ];
      for (const [cx, cy] of corners) {
        const inX = cx === minX ? b.x < cx : b.x > cx;
        const inY = cy === minY ? b.y < cy : b.y > cy;
        if (!inX || !inY) continue;
        const dx = b.x - cx;
        const dy = b.y - cy;
        const d = Math.hypot(dx, dy);
        // Inside the corner cut (past the arc): pull back onto the arc.
        if (d <= cr || d === 0) continue;
        const nx = dx / d;
        const ny = dy / d;
        b.x = cx + nx * cr;
        b.y = cy + ny * cr;
        const vn = b.vx * nx + b.vy * ny;
        if (vn > 0) {
          const rest = vn > REST_THRESHOLD ? WALL_RESTITUTION : 0;
          b.vx -= (1 + rest) * vn * nx;
          b.vy -= (1 + rest) * vn * ny;
        }
      }
    }
  }
}

function collidePair(a: JarBody, b: JarBody): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const minD = a.r + b.r;
  const d2 = dx * dx + dy * dy;
  if (d2 >= minD * minD || d2 === 0) return;
  const d = Math.sqrt(d2);
  const nx = dx / d;
  const ny = dy / d;
  const overlap = minD - d;
  a.x -= (nx * overlap) / 2;
  a.y -= (ny * overlap) / 2;
  b.x += (nx * overlap) / 2;
  b.y += (ny * overlap) / 2;
  const rvx = b.vx - a.vx;
  const rvy = b.vy - a.vy;
  const vn = rvx * nx + rvy * ny;
  if (vn >= 0) return;
  const rest = Math.abs(vn) > REST_THRESHOLD ? BODY_RESTITUTION : 0;
  const impulse = (-(1 + rest) * vn) / 2;
  a.vx -= impulse * nx;
  a.vy -= impulse * ny;
  b.vx += impulse * nx;
  b.vy += impulse * ny;
}

export function stepJar(world: JarWorld, dt = JAR_DT): void {
  if (world.settled) return;
  const x0 = new Array<number>(world.bodies.length);
  const y0 = new Array<number>(world.bodies.length);
  for (let i = 0; i < world.bodies.length; i++) {
    const b = world.bodies[i];
    x0[i] = b.x;
    y0[i] = b.y;
    b.vx = (b.vx + world.gx * dt) * AIR_DAMPING;
    b.vy = (b.vy + world.gy * dt) * AIR_DAMPING;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }
  // a few relaxation passes keep piles from sinking into each other; walls
  // re-clamp every pass so a pair can never squeeze a body through a wall
  // with a stale into-wall velocity.
  for (let p = 0; p < 3; p++) {
    for (const b of world.bodies) collideWalls(b, world);
    for (let i = 0; i < world.bodies.length; i++) {
      for (let j = i + 1; j < world.bodies.length; j++) collidePair(world.bodies[i], world.bodies[j]);
    }
  }
  for (const b of world.bodies) collideWalls(b, world);
  // velocity consistency: a body that barely moved despite a big velocity is
  // wedged — its velocity could never become motion, so drop it instead of
  // letting it accumulate into a perpetual jitter source.
  for (let i = 0; i < world.bodies.length; i++) {
    const b = world.bodies[i];
    const moved = Math.hypot(b.x - x0[i], b.y - y0[i]);
    const speed = Math.hypot(b.vx, b.vy);
    if (speed > 0 && moved < speed * dt * 0.25) {
      b.vx = (b.x - x0[i]) / dt;
      b.vy = (b.y - y0[i]) / dt;
    }
  }
  let maxV = 0;
  for (const b of world.bodies) maxV = Math.max(maxV, Math.hypot(b.vx, b.vy));
  // extra damping once the pile is nearly still, so big jars actually rest
  if (maxV < 130) {
    for (const b of world.bodies) {
      b.vx *= 0.92;
      b.vy *= 0.92;
    }
    maxV *= 0.92;
  }
  if (maxV < SLEEP_SPEED) {
    world.idleTicks += 1;
    if (world.idleTicks >= SLEEP_TICKS) {
      for (const b of world.bodies) {
        b.vx = 0;
        b.vy = 0;
      }
      world.settled = true;
    }
  } else {
    world.idleTicks = 0;
  }
}

// Run the sim synchronously until it rests (or maxSteps). Used to pre-settle
// grid piles before first paint so they show real piles, not a flat row.
export function settleJar(world: JarWorld, maxSteps = 600): number {
  let i = 0;
  while (!world.settled && i < maxSteps) {
    stepJar(world);
    i++;
  }
  return i;
}
