// Pre-generate sticker source images for the animated "start walk" collage button.
// Usage: node scripts/generate-start-stickers.mjs [--force] [--only a,b]
// Skips files that already exist unless --force or --only is given.
// Runs up to 4 generations in parallel. Single attempt per image (no hidden
// retries) so generation counts stay exact against the 20-generation budget.
// Uses only built-in fetch/fs. Never prints the API key.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "public", "start");

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

// Shared style suffix for object prompts (verbatim).
const STYLE =
  "Photorealistic single real-world object photographed straight on, like a cut-out from a magazine, " +
  "crisp edges, true colours, soft even studio light, isolated and centred on a plain pure white background " +
  "with generous white margin around it, no shadow on the background, nothing else in the frame. " +
  "No text, no letters, no numbers, no logos. No faces.";

// Style suffix for ransom-note collage letter prompts (verbatim).
const LETTER_STYLE =
  "A single capital letter only, filling most of the frame, photographed straight on as a real physical object, " +
  "like a cut-out from a magazine, crisp edges, true colours, soft even studio light, isolated and centred on " +
  "a plain pure white background with white margin around it, no shadow on the background. " +
  "Only this one letter, no other letters, words, numbers or logos.";

// Style suffix for finish-card distance digit prompts (verbatim).
const DIGIT_STYLE =
  "A single character only, filling most of the frame, photographed straight on as a real physical object, " +
  "like a cut-out from a magazine, crisp edges, true colours, soft even studio light, isolated and centred on " +
  "a plain pure white background with white margin around it, no shadow on the background. " +
  "Only this one character, no other letters, words, digits or logos.";

const LETTER_IDS = new Set([
  "letter-s", "letter-t1", "letter-a", "letter-r", "letter-t2",
  "letter-c1", "letter-c2", "letter-h1", "letter-h2", "letter-i",
  "letter-t3", "letter-t4", "letter-o", "letter-u",
  "letter-a2", "letter-o2", "letter-u2", "letter-r2", "letter-i2",
]);

const DIGIT_IDS = new Set([
  "digit-0", "digit-1", "digit-2", "digit-3", "digit-4",
  "digit-5", "digit-6", "digit-7", "digit-8", "digit-9",
  "digit-m",
]);

const DESCRIPTIONS = {
  walker:
    "a solid matte black silhouette of a person walking briskly to the right, full body side view, mid-stride, one arm forward, wearing sneakers and a small backpack, a flat black shape with no inner detail",
  footprints:
    "two dark grey sneaker sole prints, left and right, slightly offset as if walking upward, flat printed shapes with tread pattern",
  "ped-sign":
    "a square blue Taiwanese road sign with a white border, showing a simple white pictogram of a person walking on a crosswalk, mounted with two small metal bolts",
  "arrow-sign":
    "a rectangular cream-white enamel street sign with a black border and a single large black arrow pointing right, slightly worn, two small bolts",
  ticket:
    "a torn, slightly crumpled kraft-brown paper ticket stub with perforated edge, blank",
  pin: "a glossy red round map pin push-pin seen from the side",
  sneaker: "a single white canvas sneaker with red laces, side view",
  shoeprint:
    "a single small dark grey sneaker footprint, a flat printed sole shape seen from above, pointing upward",
  "map-scrap":
    "a torn scrap of a folded paper city street map, pale cream paper with thin grey streets and a few light green park patches, no text or labels",
  "ped-signal":
    "a Taiwanese pedestrian traffic signal box, black housing, showing a lit green walking-man figure in the lower lamp",
  boba: "a clear plastic cup of bubble milk tea with black tapioca pearls at the bottom, sealed plastic film lid, a thick straw",
  tape: "a short strip of torn yellow masking tape",
  "bus-ticket": "a small round blue plastic metro token, slightly glossy",
  camera:
    "a compact vintage film camera, silver and black, seen from the front at a slight angle, with a short black wrist strap",
  "camera-front":
    "a compact retro mirrorless camera seen exactly straight on from the front, perfectly level and symmetrical, silver top plate and dials, black leatherette body, a large round silver lens in the middle, no brand name, no lettering or engraving on the lens ring",
  stamp:
    "a single blank postage stamp with a white perforated edge and a plain light-blue illustrated sky with a small white cloud inside, no text, no numbers, no denomination",
  "stamp-a":
    "a single real vintage postage stamp, portrait orientation, white perforated scalloped edges, a finely engraved two-colour illustration of a tree-lined city street with a person walking, printed in muted teal and brick red ink on cream paper, slightly aged paper, complete and uncropped, ABSOLUTELY no text, letters, numbers, denomination or country name anywhere",
  "stamp-b":
    "a single real vintage postage stamp, portrait orientation, white perforated scalloped edges, a printed illustration of a red and white bicycle leaning on a lamppost, flat muted mid-century print colours with visible halftone dots, slightly aged paper, complete and uncropped, ABSOLUTELY no text, letters, numbers, denomination or country name anywhere",
  "stamp-c":
    "a single real vintage postage stamp, portrait orientation, white perforated scalloped edges, an engraved-style illustration of a winding road through hills under a pale sky, muted green and blue ink, slightly aged paper, complete and uncropped, ABSOLUTELY no text, letters, numbers, denomination or country name anywhere",
  "letter-s":
    "the capital letter S cut from a red octagonal metal stop sign, white reflective paint on red, with a small bolt",
  "letter-t1":
    "the capital letter T made of brown stitched leather with visible white stitching along the edges",
  "letter-a": "the capital letter A as a shiny inflated silver foil party balloon",
  "letter-r":
    "the capital letter R printed in bold black on a round white plastic keyboard keycap seen from above",
  "letter-t2":
    "the capital letter T as an embroidered fabric patch with yellow and green thread and a stitched border",
  "letter-c1":
    "the capital letter C cut from brown corrugated cardboard with a visible fluted cut edge",
  "letter-c2":
    "the capital letter C painted in navy blue on a square cream ceramic tile",
  "letter-h1":
    "the capital letter H cut from a dark green metal highway sign, white reflective paint on green",
  "letter-h2":
    "the capital letter H as a white chenille varsity letter with a red felt border on cream fabric",
  "letter-i":
    "the capital letter I as a black rubber-stamp print on a small scrap of kraft paper",
  "letter-t3":
    "the capital letter T painted in white on a square of weathered blue-grey driftwood",
  "letter-t4":
    "the capital letter T cut from cream watercolour paper with a soft pale-blue painted wash",
  "letter-o":
    "the capital letter O as a glossy black vinyl record with a small plain red paper label in the middle",
  "letter-u":
    "the capital letter U as a glossy sky-blue plastic fridge magnet letter",
  "letter-a2":
    "the capital letter A moulded from a glossy thick bar of dark chocolate with bevelled edges",
  "letter-o2":
    "the capital letter O as a glazed ring doughnut with pink frosting and rainbow sprinkles seen from above",
  "letter-u2":
    "the capital letter U cut from brushed brass metal with a thin engraved edge",
  "letter-r2":
    "the capital letter R cut from holographic iridescent rainbow foil with a crinkled shine",
  "letter-i2":
    "the capital letter I as a tall thin strip of torn olive-green washi tape",
  "digit-0": "the digit 0 cut from a sheet of cherry-red glossy paper",
  "digit-1": "the digit 1 cut from a sheet of royal-blue matte paper",
  "digit-2": "the digit 2 cut from a sheet of mustard-yellow card",
  "digit-3": "the digit 3 cut from a sheet of forest-green felt",
  "digit-4": "the digit 4 cut from a sheet of bright-orange paper",
  "digit-5": "the digit 5 cut from a sheet of pale-pink paper",
  "digit-6": "the digit 6 cut from blue denim fabric with visible weave",
  "digit-7": "the digit 7 as white chalk on a small square of black chalkboard",
  "digit-8": "the digit 8 as a shiny inflated gold foil party balloon",
  "digit-9": "the digit 9 printed in bold white on a round black wooden disc",
  "digit-m": "the lowercase letter m cut from a sheet of teal paper",
};

async function generateOne(id, description) {
  const style = LETTER_IDS.has(id) ? LETTER_STYLE : DIGIT_IDS.has(id) ? DIGIT_STYLE : STYLE;
  const prompt = `${description}. ${style}`;
  const res = await fetch(`${BASE}/images/generations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    // NOTE: `background` param is NOT supported by Muse Image (400) — plain white background goes in the prompt.
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
  const CONCURRENCY = 4;
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
        failed += 1;
        console.log(`${prefix} FAILED: ${e.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, oneWorker));
  return { ok, failed };
}

function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const onlyIdx = args.findIndex((a) => a === "--only" || a.startsWith("--only="));
  let only = null;
  if (onlyIdx !== -1) {
    const a = args[onlyIdx];
    const raw = a === "--only" ? (args[onlyIdx + 1] ?? "") : a.slice("--only=".length);
    only = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (only.length === 0) only = null;
  }

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
  console.log(`Generating ${ids.length} sticker(s), concurrency 4, single attempt each.`);
  runWithPool(ids, (id) => generateOne(id, DESCRIPTIONS[id])).then(({ ok, failed }) => {
    console.log(`Done: ${ok} ok, ${failed} failed.`);
    if (failed > 0) process.exitCode = 1;
  });
}

main();
