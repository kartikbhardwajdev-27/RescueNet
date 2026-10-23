"use client";

import { useEffect, useMemo, useState } from "react";
import { getCurrentLocation } from "@/lib/geo";
import { useAuth } from "./AuthProvider";

// Where the person is, best source first:
//   1. the browser's location          source "device"
//   2. the logged-in user's saved one  source "saved"
//   3. nothing                         source "none"  (callers fall back to "newest first")
// The browser location is requested once on mount (10 s limit). While it is
// pending, `locating` is true and a saved location, if any, is used meanwhile.
export default function useUserLocation() {
  const { user } = useAuth();
  const [device, setDevice] = useState(null);
  const [locating, setLocating] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    // Neighbourhood-level is plenty here, so skip GPS and accept a recent fix.
    getCurrentLocation({ signal: controller.signal, highAccuracy: false, maxAgeMs: 5 * 60_000 })
      .then(({ lng, lat }) => setDevice({ lng, lat }))
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setLocating(false);
      });
    return () => controller.abort();
  }, []);

  const [savedLng, savedLat] = user?.location?.coordinates ?? [];

  return useMemo(() => {
    if (device) return { location: device, source: "device", locating: false };
    if (savedLng !== undefined) return { location: { lng: savedLng, lat: savedLat }, source: "saved", locating };
    return { location: null, source: "none", locating };
  }, [device, savedLng, savedLat, locating]);
}
