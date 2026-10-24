"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { buildGuidance, resolveStartPoint } from "@/lib/nearest";
import { useAuth } from "./AuthProvider";

// "Nearest shelter" for the map and the shelter list. `find()` works out where
// the person is (the browser's location, else the saved one on their account,
// else it says it needs permission), and `guidance` is then recomputed from the
// shelters and incidents as they refresh, so a shelter that fills up stops being
// recommended without anyone pressing anything.
//
//   device     a location already known ({ lng, lat }) or null
//   shelters   the shelter list, or null while it has not loaded
//   incidents  the incident list, or null while it has not loaded
//
// request is one of
//   null                                                nothing asked yet
//   { id, phase: "locating" }
//   { id, phase: "need-location", code }               no location from either source
//   { id, phase: "ready", from, source }               source: "device" | "saved"
// guidance is null until ready, and also when no shelter is open with room.
// `id` changes with every press, so a screen can tell a new request from a refresh.
export default function useNearestShelter({ device, shelters, incidents }) {
  const { user } = useAuth();
  const [savedLng, savedLat] = user?.location?.coordinates ?? [];
  const [request, setRequest] = useState(null);
  const counter = useRef(0);

  const find = useCallback(async () => {
    const id = (counter.current += 1);
    setRequest({ id, phase: "locating" });
    const saved = savedLng === undefined ? null : { lng: savedLng, lat: savedLat };
    const start = await resolveStartPoint({ device, saved });
    // A newer press took over while this one waited for the browser.
    if (counter.current !== id) return;
    setRequest(start.ok ? { id, phase: "ready", from: start.point, source: start.source } : { id, phase: "need-location", code: start.code });
  }, [device, savedLng, savedLat]);

  const clear = useCallback(() => {
    counter.current += 1;
    setRequest(null);
  }, []);

  const guidance = useMemo(
    () =>
      request?.phase === "ready"
        ? buildGuidance({ from: request.from, source: request.source, shelters: shelters ?? [], incidents: incidents ?? [] })
        : null,
    [request, shelters, incidents],
  );

  return { request, guidance, find, clear, busy: request?.phase === "locating", incidentsKnown: incidents !== null };
}
