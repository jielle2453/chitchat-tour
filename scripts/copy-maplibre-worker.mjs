// MapLibre's web worker cannot be bundled by Turbopack; serve it as a static file.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const dist = path.dirname(require.resolve("maplibre-gl/package.json"));
mkdirSync("public/maplibre", { recursive: true });
copyFileSync(path.join(dist, "dist", "maplibre-gl-worker.mjs"), "public/maplibre/maplibre-gl-worker.mjs");
