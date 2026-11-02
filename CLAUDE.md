@AGENTS.md

# Roadside Guide (working name)

A walking guide that knows where you are and where you come from. While you walk, it speaks short, sourced trivia about everyday things (convenience stores, garbage trucks, utility poles, scooter waiting boxes…), picking only what differs from your hometown and comparing with it. Built for the Meta Global AI Developer Hackathon (Indie track, "Build for Your World"). Demo city: Taipei, route around Yongkang Street / Dongmen. Demo personas: a visitor from Tokyo (JP) and from New York (US).

Principles: everyday things over landmarks; never say what we cannot source; don't interrupt; never analyse people (faces are blurred).

## Stack
Next.js 16 App Router + TypeScript, deployed on Vercel. Tailwind 4. MapLibre GL with OpenFreeMap vector tiles for maps (restyled in `src/components/GuideMap.tsx`; the worker is copied to `public/maplibre/` by the postinstall script). Meta Model API through the `openai` SDK (base URL `https://api.meta.ai/v1`). Vitest for tests.

Meta API details (Responses API, `web_search` + `url_citation`, SAM 3.1 request/response format, Voice Transcribe file endpoint, Muse Image): `research/04_Meta模型技術研究.md`.

## Layout and ownership
| Path | What | Owner |
|---|---|---|
| `src/lib/types.ts` | Shared contracts (API shapes, data shapes) | lead only |
| `src/lib/meta/client.ts` | Meta client, model ids, mock-mode switch | lead only |
| `src/lib/kb/` | Knowledge base loader | lead only |
| `data/knowledge/` | Verified trivia JSON | knowledge agent |
| `src/lib/geo/`, `data/osm/`, `data/routes/`, `data/areas/`, `scripts/osm/` | Location sources, simulated walks, POI lookups | geo module |
| `src/lib/trigger/` | Novelty scoring, cooldown, dedupe | trigger module |
| `src/lib/agent/`, `src/lib/verify/`, `prompts/`, `src/app/api/{guide,ask,explain}/` | Guide agent, source checking | agent module |
| `src/lib/vision/`, `src/lib/cards/`, `src/lib/voice/`, `src/lib/tts/`, `src/app/api/{photo,card,transcribe,tts}/` | Photo, SAM, cards, speech in/out | media module |
| `src/app/` pages, `src/components/`, `src/lib/client/` | Phone UI | UI module |

## Rules for every module
- Edit only files in your own paths. Never edit `package.json`, `package-lock.json`, `tsconfig.json`, `CLAUDE.md`, `src/lib/types.ts`, `src/lib/meta/client.ts`, or another module's folder. If you need a dependency or a contract change, say so in your final report instead.
- Code against the signatures in `src/lib/types.ts` and the stub files you were given; keep exported names and shapes unchanged.
- Everything must work without `META_API_KEY` (mock mode, `isMockMode()`): return realistic canned data so the UI can be demoed.
- Server-only code starts with `import "server-only";`. API keys never reach the browser.
- API routes: `export const maxDuration = 60;`, JSON in/out matching the contracts, errors as `{ error: string }` with a proper status.
- User-facing UI text in English, Japanese and Traditional Chinese via a small dictionary; code and comments in English, comments sparse.
- Check your work: `npx vitest run <your paths>` and `npx tsc --noEmit` (only fix errors in your own files; other modules may be mid-change). Do not run `next build` or `next dev`; the lead does.
- Do not commit, push, or create branches.
