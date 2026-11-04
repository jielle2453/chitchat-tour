// Pre-generate one photo sticker per knowledge item with Muse Image: a
// realistic studio shot on pure white that the browser die-cuts (dieCut.ts).
// Usage: node scripts/generate-illustrations.mjs [--force] [--only id1,id2]
// Skips files that already exist unless --force or --only is given.
// Uses only built-in fetch/fs. Never prints the API key.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "public", "illustrations");

function loadEnvFile() {
  let text;
  try {
    text = readFileSync(join(ROOT, ".env.local"), "utf8");
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) {
      let v = m[2].trim();
      if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
        v = v.slice(1, -1);
      }
      process.env[m[1]] = v;
    }
  }
}
loadEnvFile();

const BASE = (process.env.META_BASE_URL || "https://api.meta.ai/v1").replace(/\/$/, "");
const KEY = process.env.META_API_KEY;
if (!KEY) {
  console.error("META_API_KEY is missing (checked .env.local and environment).");
  process.exit(1);
}

// Verbatim suffix from prompts/illustration-style.md.
const STYLE =
  "Realistic studio product photograph of one single real object, isolated, fully in frame with a generous margin, " +
  "centred on a pure white (#FFFFFF) seamless background. Flat, even, shadowless lighting: absolutely no shadow, " +
  "no reflection and no floor line under or around the object, the white is clean right up to its edges. " +
  "True-to-life colours and materials, sharp focus, slight three-quarter view, 50mm lens. " +
  "No text, letters, numbers or logos. No people, no hands, no faces. No other objects.";

// Hand-written concrete object description per knowledge item.
const DESCRIPTIONS = {
  "garbage-truck-why-music":
    "a small yellow Taiwanese municipal garbage truck seen from the side, with a loudspeaker horn mounted on the cab roof",
  "garbage-truck-japan-origin":
    "a vintage 1960s Japanese boxy refuse truck scale model, rounded cab, faded olive-yellow paint",
  "garbage-truck-maidens-prayer":
    "an open antique wooden music box with a brass cylinder and steel comb visible inside",
  "garbage-truck-1984-tune-swap":
    "a vintage gold-coloured metal trophy cup with two handles on a short black base",
  "garbage-truck-local-tunes":
    "a small vintage portable cassette tape player in cream plastic with a silver speaker grille",
  "taipei-pay-as-you-throw":
    "a tied, half-full translucent pale blue plastic municipal garbage bag, knotted at the top",
  "few-public-trash-cans":
    "a dark green metal public street litter bin with a domed top and a wide slot opening",
  "household-trash-in-public-bins-fine":
    "an overstuffed dark green metal street litter bin with a black household trash bag jammed into its slot",
  "convenience-store-density":
    "a miniature scale model of a generic Taiwanese corner convenience store, glass front, plain orange sign band with no words",
  "convenience-store-area-density":
    "two miniature scale-model convenience store shopfronts side by side, one with an orange sign band and one with a blue sign band, no words",
  "convenience-store-bill-payment":
    "a dark teal self-service multimedia kiosk as found in Taiwanese convenience stores, blank dark screen, small receipt slot",
  "convenience-store-tax-payment":
    "a paper payment slip with a printed barcode area left blank, clipped together with a few New Taiwan dollar coins",
  "mrt-no-eating":
    "a takeaway paper coffee cup with a plastic lid, with a round red prohibition sign plate leaning against it",
  "mrt-fare-gate-yellow-line":
    "a single grey metro fare gate cabinet with a short strip of yellow floor tape in front of it",
  "pedestrian-flashing-green-rule":
    "a Taiwanese pedestrian traffic signal head, black box, lit green walking man figure, no countdown digits",
  "pedestrian-green-man-run-animation":
    "a Taiwanese pedestrian traffic signal head, black box, lit green running man figure in mid-stride, no digits",
  "two-stage-left-turn-origin":
    "a dark red Taiwanese 125cc scooter seen from the side, parked",
  "two-stage-left-turn-tainan":
    "a dark blue Taiwanese scooter seen from the side, front wheel turned slightly left",
  "motorcycles-out-of-arcades":
    "a matte black Taiwanese scooter parked on its centre stand, seen from three-quarter front",
  "youbike-origin":
    "an orange and white Taipei YouBike share bicycle with a front basket, seen from the side",
  "youbike-free-30-min":
    "an orange YouBike share bicycle seen from the side, with a small white analogue kitchen timer in its front basket",
  "manhole-covers-art":
    "a round cast-iron decorative manhole cover with a coloured painted relief of a flower and a bird, seen from above",
  "manhole-anti-slip":
    "a round cast-iron manhole cover with a raised anti-slip grid pattern, seen from above",
  "overhead-power-lines":
    "a short section of a grey concrete utility pole top with a transformer and black cables hanging off both sides",
  "arcade-qilou-origin":
    "a miniature scale model of a historic red-brick Taiwanese shophouse with three arched arcade openings on the ground floor",
  "arcade-is-road":
    "two square white-tiled arcade pillars standing on a short slab of grey stone pavement, a fragment of a covered walkway",
  "iron-window-bars":
    "a rusty decorative iron window grille from an old Taiwanese apartment, swirl patterns, painted pale green",
  "rooftop-water-tank":
    "a cylindrical stainless steel rooftop water tank as used on Taipei apartment roofs, brushed metal with two bands, on a short steel frame",
  "bubble-tea-dispute":
    "a tall clear plastic cup of milk tea with dark tapioca pearls at the bottom, sealed film lid, thick straw",
  "breakfast-hot-food":
    "a Taiwanese breakfast: a white ceramic bowl of warm soy milk with one golden fried dough stick resting across the rim",
  "joss-paper-burners":
    "a large red-painted iron joss paper furnace from a Taiwanese temple courtyard, tall chimney top, a square opening glowing faintly orange",
  "ghost-month-offerings":
    "a red plastic tray holding packaged snacks, a few oranges and a can of drink, as set out for a Taiwanese ghost month offering",
};

async function generateOne(id, description) {
  const prompt = `${description}. ${STYLE}`;
  const res = await fetch(`${BASE}/images/generations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "muse-image-1.0", prompt, n: 1, size: "1024x1024" }),
    signal: AbortSignal.timeout(180000),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const json = await res.json();
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error(`unexpected response shape: ${JSON.stringify(json).slice(0, 200)}`);
  }
  // 512 px is plenty for a sticker; sharp ships with Next.
  const { default: sharp } = await import("sharp");
  const buf = await sharp(Buffer.from(b64, "base64")).resize(512, 512).webp({ quality: 82 }).toBuffer();
  writeFileSync(join(OUT_DIR, `${id}.webp`), buf);
  return buf.length;
}

async function runWithPool(ids, worker) {
  const CONCURRENCY = 3;
  let done = 0;
  let ok = 0;
  let failed = 0;
  const queue = [...ids];
  async function oneWorker() {
    while (queue.length > 0) {
      const id = queue.shift();
      done += 1;
      const prefix = `[${done}/${ids.length}] ${id}`;
      const t0 = Date.now();
      try {
        const bytes = await worker(id);
        ok += 1;
        console.log(`${prefix} ok (${((Date.now() - t0) / 1000).toFixed(1)}s, ${(bytes / 1024).toFixed(0)}KB)`);
      } catch (e) {
        console.log(`${prefix} failed (attempt 1): ${e.message} -- retrying once`);
        await new Promise((r) => setTimeout(r, 3000));
        const t1 = Date.now();
        try {
          const bytes = await worker(id);
          ok += 1;
          console.log(`${prefix} ok on retry (${((Date.now() - t1) / 1000).toFixed(1)}s, ${(bytes / 1024).toFixed(0)}KB)`);
        } catch (e2) {
          failed += 1;
          console.log(`${prefix} FAILED: ${e2.message}`);
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, oneWorker));
  return { ok, failed };
}

function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const onlyArg = args.find((a) => a.startsWith("--only"));
  const only = onlyArg ? onlyArg.slice("--only".length + 1).split(",").map((s) => s.trim()).filter(Boolean) : null;

  const allIds = Object.keys(DESCRIPTIONS);
  if (only) {
    const unknown = only.filter((id) => !DESCRIPTIONS[id]);
    if (unknown.length > 0) {
      console.error(`Unknown item ids: ${unknown.join(", ")}`);
      process.exit(1);
    }
  }
  mkdirSync(OUT_DIR, { recursive: true });

  let ids = only ?? allIds;
  if (!force && !only) {
    const missing = ids.filter((id) => !existsSync(join(OUT_DIR, `${id}.webp`)));
    const skipped = ids.length - missing.length;
    if (skipped > 0) console.log(`Skipping ${skipped} existing files (use --force to regenerate).`);
    ids = missing;
  }
  if (ids.length === 0) {
    console.log("Nothing to do: all files exist.");
    return;
  }
  console.log(`Generating ${ids.length} illustration(s), concurrency 3, one retry each.`);
  runWithPool(ids, (id) => generateOne(id, DESCRIPTIONS[id])).then(({ ok, failed }) => {
    console.log(`Done: ${ok} ok, ${failed} failed.`);
    if (failed > 0) process.exitCode = 1;
  });
}

main();
