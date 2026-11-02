# OSM data (Yongkang Street / Dongmen, Taipei)

Source: OpenStreetMap via the Overpass API (overpass-api.de), fetched 2026-11-02.
Attribution: © OpenStreetMap contributors, ODbL.

Bounding box (S,W,N,E): 25.0260,121.5225,25.0400,121.5360.

Query (one combined request, see `scripts/osm/fetch-pois.mjs`): `nwr` for shop=convenience, highway=traffic_signals,
highway=bus_stop, amenity=place_of_worship, amenity=bicycle_rental, amenity=marketplace, railway=subway_entrance
with `out center tags`; plus named `highway=footway|pedestrian|residential|living_street|tertiary|secondary|service`
ways with `out geom tags`.

Files:
- `yongkang.json`: `Poi[]` (ways/relations reduced to their centre).
- `streets.json`: named street geometry (`[lon,lat][]`), used only by `scripts/osm/build-route.mjs`.

Routes (`data/routes/*.json`) are built by `node scripts/osm/build-route.mjs`: waypoints are snapped to
street nodes and joined by shortest paths over the OSM street graph, so they follow real streets.

Areas (`data/areas/yongkang.json`) are hand-made simple rectangles (not OSM boundaries); the district
polygons are rough fallbacks. The smallest containing polygon wins.
