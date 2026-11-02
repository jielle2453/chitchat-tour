# Taipei verified trivia knowledge base

Verified everyday-object trivia for a walking-tour voice guide in Taipei (demo route: Yongkang Street / Dongmen). Each item carries sources and a hometown comparison for Tokyo (JP) and New York (US) visitors. Research date: 2026-11-02.

Core rule: **if it is not verified, do not say it.** A `null` comparison means "no reliable source found", never "the hometown has nothing".

## Files

| File | Purpose |
|---|---|
| `taipei.json` | JSON array, UTF-8, one object per trivia item (36 items) |
| `README.md` | This file |
| `gaps.md` | Open gaps (Traditional Chinese) and the recommended top 10 demo items |

## Field reference (`taipei.json`)

| Field | Meaning |
|---|---|
| `id` | Unique kebab-case id |
| `category` | `street`, `transport`, `shop`, `architecture`, `daily-life` |
| `layer` | `point` (tied to a mappable object), `area` (neighborhood-level), `national` (applies across Taiwan; used for things with no usable OSM tag) |
| `trigger.osm` | OpenStreetMap tags with enough Taiwan coverage: `shop=convenience`, `highway=traffic_signals`, `highway=bus_stop`, `amenity=place_of_worship`, `amenity=bicycle_rental`, `amenity=marketplace`, `railway=subway_entrance`. Empty array when no reliable tag exists (manholes, poles, trucks, arcades) |
| `trigger.context` | Time, place or situation hint for when to speak |
| `trigger.photo_concepts` | Concepts for a camera-based detector |
| `title`, `fact` | English and Traditional Chinese text, written in our own words (no quote longer than 15 words) |
| `sources` | URL, title, publisher and the `verified` level |
| `confidence` | `high`, `medium` or `low` (see below) |
| `disputed` | `true` when credible sources contradict each other. Never state a single origin for these |
| `caveats` | Do-not-say notes and time limits, or `null` |
| `hometown.JP` / `hometown.US` | `status`: `same`, `different`, `absent`, `unknown`. `comparison`: text or `null`. Own `sources` and `confidence` |

## Verification rules

`verified` per source:

- `full-text`: the page was opened and the specific claim was read there. This includes pages read during the earlier research round (2026-10-31) that were logged as full-text in `06_台北冷知識與Demo路線.md` (for example the Taiwan Insight article, the Ministry of Economic Affairs density report, the MLIT pole-removal page, the Newtalk pedestrian-rule article, the realestateguide.jp page and the trafficnews.jp page).
- `snippet`: only a search-result summary was seen, or the page could not be opened (403, timeout, binary). Claims backed only by snippets are never `high`.

`confidence`:

- `high`: an official or primary source read in full, or two independent sources agreeing, with the claim stated directly.
- `medium`: one reasonable source read in full, or several snippets that agree; details may carry caveats.
- `low`: a single snippet, a commercial or opinion source, a contested story, or numbers that conflict between sources. Low items should be spoken only with hedges ("one source says") or not at all.

Other rules:

- `disputed: true` items (Fur Elise origin, two-stage left turn origin, bubble tea inventor, Taipei underground-cable share) must not be presented as settled. See `caveats`.
- Numbers carry a year in the text where known. Do not drop the year when speaking.
- Corrections made versus the earlier notes: the Tainan "21 percent crash drop" was not in the source page (the article says traffic deaths fell 14.2 percent, unattributed); the "2017 metro relaxation" and a "2019 bubble tea court ruling" were not found in the pages checked; the "14.42 million motorcycles" and "806 street bins" figures were not found in the pages checked, so they were left out.

## Source licensing notes

- Facts are not copyrightable, but the wording of sources is. All `fact` and `comparison` text is paraphrased. If you display source titles or short quotes, keep each under 15 words and attribute them.
- Government pages (nyc.gov, mta.info, fhwa.dot.gov, nhtsa.dot.gov, mlit.go.jp, gov.taipei, MOEA via PTS) are public information, but terms differ by site. NYC and US federal publications are generally reusable with attribution; check Taiwan and Japan government open-data terms before redistributing bulk text.
- News and magazine pages (PTS, Newtalk, NOWnews, The News Lens, 6sqft, Marketplace, EC&M, NPR) are cited only as references. Do not copy their text.
- Wikipedia text is CC BY-SA 4.0. Only a fact was used here, with the link kept as attribution.
- OpenStreetMap data is ODbL, copyright OpenStreetMap contributors. Only tag names are listed here, not map data.
- Private-company pages (realestateguide.jp, PRO360) are weak sources and are marked accordingly.
