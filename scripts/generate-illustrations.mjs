// Pre-generate one flat illustration per knowledge item with Muse Image.
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
  "Hand-made flat illustration built from a few big solid colour blocks: " +
  "chunky simplified shapes with slightly wobbly, uneven, hand-cut edges, no outlines. " +
  "Use the object's real-world colours, flat and slightly muted. " +
  "Plain solid fills only: no patterns, no dots, no stripes, no texture, no gradients, no shading, no 3D. " +
  "Very few details, small dark shapes only where needed (windows, wheels). " +
  "Single object, centred, plain white background, no border. " +
  "No text, letters or numbers. No face. No people.";

// Hand-written concrete object description per knowledge item.
const DESCRIPTIONS = {
  "garbage-truck-why-music":
    "a mustard-yellow Taiwanese garbage truck seen from the side, with a small dark grey loudspeaker on the cab roof and two small solid dark music notes floating above the cargo box",
  "garbage-truck-japan-origin":
    "an old 1960s boxy refuse truck with a rounded cab and a dusty olive-yellow body, with a small brass wind-up key sticking out of its side",
  "garbage-truck-maidens-prayer":
    "a small open wind-up music box in dark brown wood with a golden brass cylinder and comb visible inside",
  "garbage-truck-fur-elise":
    "the rear view of a mustard-yellow garbage truck with a wide dark open loading hopper and two dark grey tied trash bags beside it",
  "garbage-truck-1984-tune-swap":
    "a chunky golden trophy cup with two small handles and a short stem base",
  "garbage-truck-1968-objection":
    "a dark grey horn loudspeaker on a short stand, mouth facing left",
  "garbage-truck-local-tunes":
    "a solid teal island shape like Taiwan with one small solid dark music note placed on its northern end",
  "taipei-pay-as-you-throw":
    "a cobalt-blue plastic rubbish bag with a knotted tied top, slightly slumped",
  "few-public-trash-cans":
    "a dark green metal street litter bin with a domed top and a wide slot opening",
  "household-trash-in-public-bins-fine":
    "a dark green street litter bin with a thick red prohibition ring and diagonal slash over it",
  "convenience-store-density":
    "a small generic convenience shopfront: cream walls, a plain dusty-orange sign band with no words above a big glass shopfront and a glass door",
  "convenience-store-area-density":
    "two small generic shopfronts side by side, one with a dusty-orange sign band and one with a slate-blue sign band, both with big glass windows and no words",
  "convenience-store-bill-payment":
    "a freestanding dark teal self-service bill-payment kiosk with a dark blank screen and a small slot, no words",
  "convenience-store-tax-payment":
    "a stack of three gold coins beside a cream paper envelope sealed with a solid red square stamp, no words",
  "mrt-no-eating":
    "a brown paper takeaway cup with a thick red prohibition ring and diagonal slash over it",
  "mrt-fare-gate-yellow-line":
    "three dark grey metro fare gate posts in a row with one thick mustard-yellow floor line running across in front of them",
  "pedestrian-flashing-green-rule":
    "a dark grey pedestrian signal box showing one solid green walking-person symbol, no numbers",
  "pedestrian-green-man-run-animation":
    "a dark grey pedestrian signal box showing one solid green running-person symbol with two short solid motion bars behind it, no numbers",
  "two-stage-left-turn-origin":
    "a dark red scooter seen from the side, parked inside a large flat dark-grey painted rectangular road marking",
  "two-stage-left-turn-tainan":
    "a dark blue scooter seen from the side next to one big solid curved arrow pointing left",
  "motorcycle-share-of-road-deaths":
    "two crossing dark grey road bands forming a cross seen from above, with one small dark red scooter at the centre",
  "motorcycles-out-of-arcades":
    "a beige shophouse arcade front with three round arches, with a dark red scooter under it crossed by a red prohibition ring and slash",
  "youbike-origin":
    "a bright orange city-share bicycle with a front basket, locked to a short grey docking post",
  "youbike-free-30-min":
    "a bright orange city-share bicycle next to a plain cream clock face with two dark hands and no numbers",
  "manhole-covers-art":
    "a round charcoal-grey manhole cover carrying one big solid teal curved shape and one small solid mustard circle, no words",
  "manhole-anti-slip":
    "a round dark grey manhole cover with one wide raised outer ring and one small raised centre disc, no words",
  "overhead-power-lines":
    "a grey concrete utility pole with black overhead wires stretching out to both sides and a small grey transformer box on the pole",
  "underground-share-conflict":
    "a grey concrete utility pole with its black wires cut short, and a dark coil of cable lying at its base",
  "arcade-qilou-origin":
    "a historic beige shophouse front with three round arcade arches and a dark grey pitched tile roof",
  "arcade-is-road":
    "two beige arcade columns standing on one long flat grey level ramp step",
  "iron-window-bars":
    "a small window with dark grey iron bars set in a mustard-yellow wall square",
  "rooftop-water-tank":
    "a light grey cylindrical stainless steel rooftop water tank with two dark bands around it, standing on a small metal stand",
  "bubble-tea-dispute":
    "a tall beige milk-tea cup with dark round tapioca pearls at the bottom and one thick dark straw",
  "breakfast-hot-food":
    "a teal breakfast bowl of cream-coloured soy milk with one golden-brown fried dough stick resting across the top",
  "joss-paper-burners":
    "a squat rust-red temple furnace with a wide dark round mouth and two short legs",
  "ghost-month-offerings":
    "a low brown wooden offering table holding three dark bowls of food and two thick red candles",
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
  const buf = Buffer.from(b64, "base64");
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
