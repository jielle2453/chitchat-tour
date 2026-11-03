"use client";
// Destination picking state: search (debounced, min 2 chars), nearby
// worth-visiting places, tap-the-map, route preview. The walk itself is
// owned by the guide session; this hook only prepares the destination.
import { useCallback, useEffect, useRef, useState } from "react";
import type { GeocodeResult, GeoFix, Lang, NearbyPoi, WalkRoute } from "@/lib/types";
import { t } from "./i18n";
import {
  displayName,
  fetchGeocode,
  fetchNearby,
  fetchWalkRouteOptions,
  PICK_PLACES_RADIUS_M,
  selectPickPlaces,
  TakeLatest,
  worthVisiting,
} from "./navEngine";
export interface WalkDestination {
  name: string;
  label: string;
  lat: number;
  lon: number;
}

export type DestStatus = "idle" | "picking" | "preview" | "walking" | "arrived";

// Picked-place choice: a NearbyPoi id, or "spot" for the raw tapped point.
export const PICK_SPOT = "spot";

const SEARCH_DEBOUNCE_MS = 400;
const NEARBY_RADIUS_M = 500;
const NEARBY_LIMIT = 8;

export interface UseDestinationWalkOptions {
  lang: Lang;
  getFix: () => GeoFix | null;
  hometown?: string;
}

export function useDestinationWalk(options: UseDestinationWalkOptions) {
  const [status, setStatus] = useState<DestStatus>("idle");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [nearby, setNearby] = useState<NearbyPoi[] | null>(null);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [pickArmed, setPickArmed] = useState(false);
  const [pickPoint, setPickPoint] = useState<{ lat: number; lon: number } | null>(null);
  const [pickPlaces, setPickPlaces] = useState<NearbyPoi[] | null>(null);
  const [pickPlacesLoading, setPickPlacesLoading] = useState(false);
  const [pickChoice, setPickChoice] = useState<string | null>(null);
  const [destination, setDestination] = useState<WalkDestination | null>(null);
  const [route, setRoute] = useState<WalkRoute | null>(null);
  const [routes, setRoutes] = useState<WalkRoute[] | null>(null);
  const [routeIndex, setRouteIndex] = useState(0);
  const [storyCounts, setStoryCounts] = useState<number[]>([]);
  const [routing, setRouting] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState(0); // bumped per planned route: the map fits bounds

  const optsRef = useRef(options);
  useEffect(() => {
    optsRef.current = options;
  });
  const searchToken = useRef(0);
  const planGuard = useRef(new TakeLatest());
  const pickGuard = useRef(new TakeLatest());
  const destinationRef = useRef<WalkDestination | null>(null);
  useEffect(() => {
    destinationRef.current = destination;
  }, [destination]);

  const clearPick = useCallback(() => {
    pickGuard.current.reset();
    setPickPoint(null);
    setPickPlaces(null);
    setPickPlacesLoading(false);
    setPickChoice(null);
  }, []);

  const open = useCallback(() => {
    setStatus("picking");
    setRouteError(null);
    setPickArmed(false);
    setPickPoint(null);
  }, []);

  const cancelPick = useCallback(() => {
    planGuard.current.reset();
    pickGuard.current.reset();
    setStatus((s) => (s === "picking" || s === "preview" ? "idle" : s));
    setPickArmed(false);
    setPickPoint(null);
    setPickPlaces(null);
    setPickPlacesLoading(false);
    setPickChoice(null);
    setDestination(null);
    setRoute(null);
    setRoutes(null);
    setRouteIndex(0);
    setStoryCounts([]);
    setRouteError(null);
  }, []);

  const loadNearby = useCallback(() => {
    const fix = optsRef.current.getFix();
    if (!fix) {
      setNearby([]);
      return;
    }
    setNearbyLoading(true);
    fetchNearby(fix.lat, fix.lon, NEARBY_RADIUS_M)
      .then((pois) => {
        setNearby(pois.filter(worthVisiting).slice(0, NEARBY_LIMIT));
      })
      .catch(() => setNearby([]))
      .finally(() => setNearbyLoading(false));
  }, []);

  useEffect(() => {
    if (status !== "picking") return;
    loadNearby();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const runSearch = useCallback((q: string) => {
    const o = optsRef.current;
    const token = ++searchToken.current;
    setSearching(true);
    fetchGeocode(q, o.getFix(), o.lang)
      .then((r) => {
        if (token !== searchToken.current) return;
        setResults(r.slice(0, 8));
        setSearched(true);
      })
      .catch(() => {
        if (token !== searchToken.current) return;
        setResults([]);
        setSearched(true);
      })
      .finally(() => {
        if (token === searchToken.current) setSearching(false);
      });
  }, []);

  // Clearing happens in changeQuery (event-driven); the effect only debounces.
  const changeQuery = useCallback((q: string) => {
    setQuery(q);
    if (q.trim().length < 2) {
      searchToken.current++;
      setResults([]);
      setSearched(false);
      setSearching(false);
    }
  }, []);

  // Debounced search: min 2 chars, >= 400 ms.
  useEffect(() => {
    const q = query.trim();
    if (status !== "picking" || q.length < 2) return;
    const id = setTimeout(() => runSearch(q), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query, status, runSearch]);

  const planTo = useCallback((dest: WalkDestination, from: GeoFix | null) => {
    const o = optsRef.current;
    const token = planGuard.current.issue();
    setDestination(dest);
    setPickArmed(false);
    setRoute(null);
    setRoutes(null);
    setRouteIndex(0);
    setStoryCounts([]);
    setRouteError(null);
    setStatus("preview");
    setPreviewKey((k) => k + 1);
    if (!from) {
      setRouteError(t(o.lang, "destRouteFail"));
      return;
    }
    setRouting(true);
    fetchWalkRouteOptions(from, dest, o.lang, o.hometown)
      .then((opts) => {
        if (!planGuard.current.isLatest(token)) return; // stale: a newer tap won
        setRoutes(opts.routes);
        setStoryCounts(opts.stories);
        setRouteIndex(0);
        setRoute(opts.fastest);
        // The pre-fetch previewKey bump fired with no route yet: bump again
        // now that the lines exist so the map fits them.
        setPreviewKey((k) => k + 1);
      })
      .catch(() => {
        if (!planGuard.current.isLatest(token)) return;
        setRouteError(t(optsRef.current.lang, "destRouteFail"));
      })
      .finally(() => {
        if (planGuard.current.isLatest(token)) setRouting(false);
      });
  }, []);

  const chooseResult = useCallback(
    (r: GeocodeResult, from: GeoFix | null) => {
      clearPick();
      planTo({ name: r.name, label: r.label, lat: r.lat, lon: r.lon }, from);
    },
    [clearPick, planTo],
  );

  const choosePoi = useCallback(
    (p: NearbyPoi, from: GeoFix | null) => {
      clearPick();
      planTo({ name: displayName(p, optsRef.current.lang), label: "", lat: p.lat, lon: p.lon }, from);
    },
    [clearPick, planTo],
  );

  // Map tap: plan instantly to the tapped point, then resolve the closest
  // named places. The closest one lends its name to the destination (the
  // coordinates stay on the tap until the walker picks a place).
  const choosePoint = useCallback(
    (lat: number, lon: number, name: string, from: GeoFix | null, named = false) => {
      const token = pickGuard.current.issue();
      setPickPoint({ lat, lon });
      setPickPlaces(null);
      setPickChoice(null);
      setPickPlacesLoading(true);
      planTo({ name, label: "", lat, lon }, from);
      fetchNearby(lat, lon, PICK_PLACES_RADIUS_M)
        .then((pois) => {
          if (!pickGuard.current.isLatest(token)) return;
          const places = selectPickPlaces(pois);
          setPickPlaces(places);
          setPickPlacesLoading(false);
          const top = places[0];
          if (named) {
            // the user tapped a place label: keep that name, highlight it if listed
            const same = places.find((p) => displayName(p, optsRef.current.lang) === name);
            setPickChoice(same ? same.id : PICK_SPOT);
          } else if (top) {
            setPickChoice(top.id);
            // Preselect the closest name; keep the tapped coordinates.
            // A newer planTo (search, another tap) wins: only rename a
            // destination that is still on this tap.
            setDestination((d) =>
              d && d.lat === lat && d.lon === lon ? { ...d, name: displayName(top, optsRef.current.lang) } : d,
            );
          } else {
            setPickChoice(PICK_SPOT);
          }
        })
        .catch(() => {
          if (!pickGuard.current.isLatest(token)) return;
          setPickPlaces([]);
          setPickPlacesLoading(false);
          setPickChoice(PICK_SPOT);
        });
    },
    [planTo],
  );

  // Pick one of the named places near the tap: the destination moves to the
  // POI itself and the route is replanned (skipped when already there).
  const choosePickPlace = useCallback(
    (p: NearbyPoi, from: GeoFix | null) => {
      if (!pickPoint) return;
      pickGuard.current.reset();
      setPickPlacesLoading(false);
      setPickChoice(p.id);
      const d = destinationRef.current;
      const name = displayName(p, optsRef.current.lang);
      if (!d || d.lat !== p.lat || d.lon !== p.lon || d.name !== name) {
        planTo({ name, label: "", lat: p.lat, lon: p.lon }, from);
      }
    },
    [pickPoint, planTo],
  );

  // "Just this spot": the destination stays on (or returns to) the tap.
  const chooseSpot = useCallback(
    (name: string, from: GeoFix | null) => {
      if (!pickPoint) return;
      pickGuard.current.reset();
      setPickPlacesLoading(false);
      setPickChoice(PICK_SPOT);
      const d = destinationRef.current;
      if (d && d.lat === pickPoint.lat && d.lon === pickPoint.lon) {
        if (d.name !== name) setDestination({ ...d, name });
      } else {
        planTo({ name, label: "", lat: pickPoint.lat, lon: pickPoint.lon }, from);
      }
    },
    [pickPoint, planTo],
  );

  const retryRoute = useCallback(
    (from: GeoFix | null) => {
      if (destination) planTo(destination, from);
    },
    [destination, planTo],
  );

  const replaceRoute = useCallback((next: WalkRoute) => {
    setRoute(next);
    setRouteError(null);
  }, []);

  const selectRoute = useCallback(
    (index: number) => {
      if (!routes || index < 0 || index >= routes.length || index === routeIndex) return;
      setRouteIndex(index);
      setRoute(routes[index]);
      // The selected line changed: refit the map to it.
      setPreviewKey((k) => k + 1);
    },
    [routes, routeIndex],
  );

  const backToPick = useCallback(() => {
    planGuard.current.reset();
    setStatus("picking");
    setRoute(null);
    setRoutes(null);
    setRouteIndex(0);
    setStoryCounts([]);
    setRouteError(null);
    setPickPoint(null);
    setPickPlaces(null);
    setPickPlacesLoading(false);
    setPickChoice(null);
  }, []);

  const startWalking = useCallback(() => {
    if (route && destination) setStatus("walking");
  }, [route, destination]);

  const markArrived = useCallback(() => setStatus("arrived"), []);

  const reset = useCallback(() => {
    searchToken.current++;
    planGuard.current.reset();
    pickGuard.current.reset();
    setStatus("idle");
    setQuery("");
    setResults([]);
    setSearched(false);
    setPickArmed(false);
    setPickPoint(null);
    setPickPlaces(null);
    setPickPlacesLoading(false);
    setPickChoice(null);
    setDestination(null);
    setRoute(null);
    setRoutes(null);
    setRouteIndex(0);
    setStoryCounts([]);
    setRouteError(null);
  }, []);

  return {
    status,
    query,
    setQuery: changeQuery,
    results,
    searching,
    searched,
    nearby,
    nearbyLoading,
    pickArmed,
    setPickArmed,
    pickPoint,
    pickPlaces,
    pickPlacesLoading,
    pickChoice,
    destination,
    route,
    routes,
    routeIndex,
    storyCounts,
    routing,
    routeError,
    previewKey,
    open,
    cancelPick,
    loadNearby,
    searchNow: runSearch,
    chooseResult,
    choosePoi,
    choosePoint,
    choosePickPlace,
    chooseSpot,
    retryRoute,
    replaceRoute,
    selectRoute,
    backToPick,
    startWalking,
    markArrived,
    reset,
  };
}

export type DestinationWalk = ReturnType<typeof useDestinationWalk>;
