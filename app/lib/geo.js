// Device geolocation as a promise, with a hard time limit. The browser's
// navigator.geolocation on the website, the Capacitor plugin in the Android app
// (see lib/devicePosition.js).

import { LOCATION_DENIED_HELP, deviceGeolocation } from "./devicePosition.js";

export const LOCATION_TIMEOUT_MS = 10_000;

function locationError(code) {
  return Object.assign(new Error(`Location ${code}`), { code });
}

const round = (n) => Number(n.toFixed(6));

// Resolves { lng, lat, accuracy } (accuracy in metres). Rejects with an Error
// whose `code` is "denied" | "unavailable" | "timeout" | "unsupported" | "aborted".
// Pass an AbortSignal to cancel while waiting.
// highAccuracy asks for GPS-grade fixes (slower, uses more battery); maxAgeMs is
// how old a cached fix may be.
export function getCurrentLocation({ timeoutMs = LOCATION_TIMEOUT_MS, signal, highAccuracy = true, maxAgeMs = 10_000 } = {}) {
  return new Promise((resolve, reject) => {
    const geolocation = deviceGeolocation();
    if (!geolocation) {
      reject(locationError("unsupported"));
      return;
    }
    if (signal?.aborted) {
      reject(locationError("aborted"));
      return;
    }

    let timer;
    const finish = (settle, value) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      settle(value);
    };
    const onAbort = () => finish(reject, locationError("aborted"));
    signal?.addEventListener("abort", onAbort);

    // The browser's own timeout only starts once permission is granted, so an
    // unanswered permission prompt could wait forever. This timer covers that,
    // keeping the total wait at `timeoutMs` either way.
    timer = setTimeout(() => finish(reject, locationError("timeout")), timeoutMs);

    geolocation.getCurrentPosition(
      ({ coords }) => finish(resolve, { lng: round(coords.longitude), lat: round(coords.latitude), accuracy: coords.accuracy }),
      (err) => finish(reject, locationError(err.code === 1 ? "denied" : err.code === 3 ? "timeout" : "unavailable")),
      { enableHighAccuracy: highAccuracy, timeout: timeoutMs, maximumAge: maxAgeMs },
    );
  });
}

// Plain-language explanation for a rejected getCurrentLocation().
export function describeLocationError(code) {
  switch (code) {
    case "denied":
      return `Location permission was denied. ${LOCATION_DENIED_HELP}`;
    case "timeout":
      return "Couldn't get your location in time. Try again.";
    case "unsupported":
      return "This browser doesn't support location.";
    default:
      return "Your location isn't available right now.";
  }
}

// Straight-line distance in kilometres between two { lng, lat } points.
export function distanceKm(a, b) {
  const rad = (deg) => (deg * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// "850 m", "1.2 km", "14 km".
export function formatDistance(km) {
  // Under 995 m, because anything above rounds up to "1000 m" at the nearest 10.
  if (km < 0.995) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`;
  return km < 9.95 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}
