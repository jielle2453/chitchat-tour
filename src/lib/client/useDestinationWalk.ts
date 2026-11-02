"use client";
// Destination picking state: search (debounced, min 2 chars), nearby
// worth-visiting places, tap-the-map, route preview. The walk itself is
// owned by the guide session; this hook only prepares the destination.
import { useCallback, useEffect, useRef, useState } from "react";
import type { GeocodeResult, GeoFix, Lang, NearbyPoi, WalkRoute } from "@/lib/types";
import { t } from "./i18n";
import { fetchGeocode, fetchNearby, fetchWalkRoute, worthVisiting } from "./navEngine";
export interface WalkDestination {
  name: string;
  label: string;
  lat: number;
  lon: number;
}

export type DestStatus = "idle" | "picking" | "preview" | "walking" | "arrived";

const SEARCH_DEBOUNCE_MS = 400;
const NEARBY_RADIUS_M = 500;
const NEARBY_LIMIT = 8;

export interface UseDestinationWalkOptions {
  lang: Lang;
  getFix: () => GeoFix | null;
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
  const [destination, setDestination] = useState<WalkDestination | null>(null);
  const [route, setRoute] = useState<WalkRoute | null>(null);
  const [routing, setRouting] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState(0); // bumped per planned route: the map fits bounds

  const optsRef = useRef(options);
  useEffect(() => {
    optsRef.current = options;
  });
  const searchToken = useRef(0);

  const open = useCallback(() => {
    setStatus("picking");
    setRouteError(null);
    setPickArmed(false);
    setPickPoint(null);
  }, []);

  const cancelPick = useCallback(() => {
    setStatus((s) => (s === "picking" || s === "preview" ? "idle" : s));
    setPickArmed(false);
    setPickPoint(null);
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
    setDestination(dest);
    setPickArmed(false);
    setRoute(null);
    setRouteError(null);
    setStatus("preview");
    setPreviewKey((k) => k + 1);
    if (!from) {
      setRouteError(t(o.lang, "destRouteFail"));
      return;
    }
    setRouting(true);
    fetchWalkRoute(from, dest, o.lang)
      .then((r) => setRoute(r))
      .catch(() => setRouteError(t(optsRef.current.lang, "destRouteFail")))
      .finally(() => setRouting(false));
  }, []);

  const chooseResult = useCallback(
    (r: GeocodeResult, from: GeoFix | null) => {
      planTo({ name: r.name, label: r.label, lat: r.lat, lon: r.lon }, from);
    },
    [planTo],
  );

  const choosePoi = useCallback(
    (p: NearbyPoi, from: GeoFix | null) => {
      planTo({ name: p.name ?? p.brand ?? p.kind, label: "", lat: p.lat, lon: p.lon }, from);
    },
    [planTo],
  );

  const choosePoint = useCallback(
    (lat: number, lon: number, name: string, from: GeoFix | null) => {
      setPickPoint({ lat, lon });
      planTo({ name, label: "", lat, lon }, from);
    },
    [planTo],
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

  const backToPick = useCallback(() => {
    setStatus("picking");
    setRoute(null);
    setRouteError(null);
    setPickPoint(null);
  }, []);

  const startWalking = useCallback(() => {
    if (route && destination) setStatus("walking");
  }, [route, destination]);

  const markArrived = useCallback(() => setStatus("arrived"), []);

  const reset = useCallback(() => {
    searchToken.current++;
    setStatus("idle");
    setQuery("");
    setResults([]);
    setSearched(false);
    setPickArmed(false);
    setPickPoint(null);
    setDestination(null);
    setRoute(null);
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
    destination,
    route,
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
    retryRoute,
    replaceRoute,
    backToPick,
    startWalking,
    markArrived,
    reset,
  };
}

export type DestinationWalk = ReturnType<typeof useDestinationWalk>;
