# Roadside Guide

**A walking guide that knows where you are, and where you come from.**

You put your phone in your pocket and walk. When you pass something ordinary — a convenience store, a garbage truck playing Für Elise, a scooter waiting box, a red-and-green postbox — Roadside Guide tells you one short, sourced piece of trivia about it. It only picks things that are likely to be *new to you*, and it compares them with how things work elsewhere.

Built for the Meta Global AI Developer Hackathon, Indie Developer track, theme "Build for Your World". The demo city is Taipei, on a route around Yongkang Street and Dongmen.

## Why

Most city guides talk about landmarks. What visitors actually notice and wonder about is the everyday stuff: why the garbage truck plays music, why every arcade has a step, why there are so few public bins. And what is surprising depends on where you come from. A visitor from Tokyo and a visitor from New York walking the same street should not hear the same things.

Principles:

- **Everyday things over landmarks.**
- **Never say what we cannot source.** Every fact has a source the user can open; if the model cannot find one on a trusted site, the guide stays quiet.
- **Don't interrupt.** Speak only when something is actually there, at most one short line at a time, with cooldowns.
- **Never analyse people.** Faces are blurred on the device before a photo leaves the phone.

## What it does

- **Walk.** A map follows you (real GPS, or a simulated walk for the demo). When you come near something the knowledge base covers, the guide decides whether it is worth saying *for you* and speaks it in a sentence or two, with a "here / in many places" comparison and a source card.
- **Ask.** Type or hold to talk ("why are there so many convenience stores?"). Muse Spark searches the web, and the answer only keeps sources from an allow-list of trusted domains (government, universities, major newspapers…).
- **Live discovery.** Outside the hand-made knowledge base, the app looks up places ahead of you on OpenStreetMap and has Muse Spark research them on the web, showing its steps as a readable timeline. Only whitelisted, cited findings become narrations.
- **Destination walks.** Pick a destination; you get walking directions with spoken turn cues, rerouting, and suggestions for small detours that pass something interesting.
- **Photo.** Point the camera at something. Faces are blurred on the device, Muse Spark finds the objects, SAM 3.1 cuts them out, and the cut-out becomes a die-cut sticker in your notebook, with the trivia attached if we have it.
- **Notebook.** Each walk becomes a page: a hand-drawn collage map that redraws your route and drops stickers where you heard things. There is no completion score — everyone's notebook is different.
- **Compare demo** (`/demo/compare`): the same route side by side for a Tokyo visitor and a New York visitor, showing they hear different things.

UI text is available in English, Japanese and Traditional Chinese.

## Meta models used

| Model | Where | What for |
|---|---|---|
| **Muse Spark 1.3** (`muse-spark-1.3`, Responses API) | `src/lib/agent/` | Guide decisions (speak or stay silent, pick the item, write the line for this visitor), JSON-structured answers |
| **Muse Spark 1.3 + `web_search`** | `src/lib/agent/ask.ts`, `discover.ts` | Questions and live discovery; sources read via `include: ["web_search_call.action.sources", "web_search_call.results"]`, then filtered by `data/source-whitelist.json` |
| **Muse Spark 1.3 (vision)** | `src/lib/vision/` | Finds objects in a photo and returns bounding boxes (normalised 0–1000) |
| **SAM 3.1** (`sam-3.1`) | `src/lib/vision/sam.ts` | Refines the boxes into masks for die-cut stickers; a "person" text prompt finds people so the app can pixelate them as a second privacy pass |
| **Muse Voice Transcribe** (`muse-voice-transcribe-1.0`) | `src/lib/voice/` | Hold-to-talk speech to text (WAV), Chinese output converted to Traditional with OpenCC |
| **Muse Image** (`muse-image-1.0`) | `scripts/generate-illustrations.mjs` | The flat cut-paper illustrations for each trivia topic, generated ahead of time (live generation takes ~30 s, too slow while walking) |

Muse Code (with Muse Spark) was also used as a coding agent during development.

## Architecture

```
Phone (Next.js App Router, React 19)
  ├─ GPS / simulated walk ──► trigger: novelty score, cooldown, dedupe, "only after seeing it"
  ├─ MapLibre GL + OpenFreeMap tiles (restyled)
  ├─ MediaPipe face blur (on device)        speechSynthesis for voice output
  ▼
Next.js API routes (server only; the API key never reaches the browser)
  /api/guide     KB candidates → Muse Spark decides and writes the line
  /api/ask       Muse Spark + web_search → whitelist-checked answer
  /api/discover  OSM places ahead → Muse Spark + web_search → whitelist-checked findings
  /api/explain   longer explanation of one item
  /api/photo     Muse Spark boxes → SAM 3.1 masks → stickers
  /api/transcribe  Muse Voice Transcribe
  /api/nearby  /api/geocode  /api/route   OSM POIs (static + Overpass), Nominatim, OSRM foot routing
  ▼
Data
  data/knowledge/taipei.json   verified trivia with sources and per-country comparisons
  data/osm/                    POIs and streets around Yongkang Street (OSM)
  data/routes/                 simulated demo walks snapped to real streets
  data/source-whitelist.json   domains that count as a source
  prompts/                     system prompts
```

Every Meta call goes through the `openai` SDK with base URL `https://api.meta.ai/v1` (`src/lib/meta/client.ts`). A per-instance daily request limit (`DAILY_REQUEST_LIMIT`) guards the public demo.

### The knowledge base

`data/knowledge/taipei.json` holds 51 hand-researched items (some are follow-up facets of a parent topic). Each item has:

- the fact in English, Traditional Chinese and Japanese, in our own words;
- sources with a verification level (`full-text` = the claim was read on the page; `snippet` = search summary only, never high confidence);
- a comparison per hometown (Japan, United States) with its own sources, or `null` when we could not verify one — `null` means "we don't know", never "it doesn't exist there";
- triggers: OSM tags, context hints, and photo concepts.

See `data/knowledge/README.md` for the full field reference.

## Run it

Requirements: Node.js 20+.

```bash
npm install          # also copies the MapLibre worker into public/maplibre/
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. **Without `META_API_KEY` everything runs in mock mode** with realistic canned data, so the whole app can be tried without a key. Add a Meta API key to `.env.local` to use the real models.

GPS, microphone and camera need HTTPS on a phone; use the deployed URL or a tunnel for real walks. The simulated walks work anywhere.

```bash
npm test             # Vitest
npm run typecheck
npm run lint
```

Environment variables (see `.env.example`):

| Variable | Meaning |
|---|---|
| `META_API_KEY` | Meta Model API key. Empty = mock mode |
| `META_BASE_URL` | Default `https://api.meta.ai/v1` |
| `META_TEXT_MODEL` | Default `muse-spark-1.3` |
| `TTS_PROVIDER` | `none` (browser speech), `azure` or `elevenlabs` |
| `DAILY_REQUEST_LIMIT` | Cost guard per server instance, default 2000 |

## Built during the hackathon

All code, data, prompts and images in this repository were created during the hackathon, starting with the first commit on 2026-11-02:

- The Next.js app: walk screen, notebook, settings, onboarding, compare demo
- Guide agent (Muse Spark), question answering and live discovery with web search, source whitelist checking
- Novelty / cooldown / dedupe trigger logic
- Photo pipeline: on-device face blur, Muse Spark object boxes, SAM 3.1 masks, browser-made die-cut stickers
- Hold-to-talk transcription with Muse Voice Transcribe
- Destination walks: geocoding, foot routing, turn cues, rerouting, detour suggestions
- Restyled MapLibre map and hand-drawn collage notebook
- The verified Taipei knowledge base (51 items) and the Yongkang Street OSM extract and demo routes
- 36 illustrations generated with Muse Image
- Tests (Vitest)

Desk research notes in `research/` (in Traditional Chinese) cover user questions, competitors, Meta model behaviour and the Taipei trivia; they document what was checked and why.

## Data and attribution

- Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, available under the Open Database License (ODbL). POIs fetched through the Overpass API; geocoding by Nominatim; foot routing by the OSRM instance at routing.openstreetmap.de.
- Map tiles by [OpenFreeMap](https://openfreemap.org/), using the [OpenMapTiles](https://openmaptiles.org/) schema.
- Face detection by [MediaPipe](https://ai.google.dev/edge/mediapipe) (BlazeFace short range).
- Trivia sources are listed per item in `data/knowledge/taipei.json` and shown in the app.
- Illustrations generated with Meta Muse Image.
