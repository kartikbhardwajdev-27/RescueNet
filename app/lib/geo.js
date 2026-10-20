// Browser geolocation as a promise, with a hard time limit.

export const LOCATION_TIMEOUT_MS = 10_000;

function locationError(code) {
  return Object.assign(new Error(`Location ${code}`), { code });
}

const round = (n) => Number(n.toFixed(6));

// Resolves { lng, lat, accuracy } (accuracy in metres). Rejects with an Error
// whose `code` is "denied" | "unavailable" | "timeout" | "unsupported" | "aborted".
// Pass an AbortSignal to cancel while waiting.
export function getCurrentLocation({ timeoutMs = LOCATION_TIMEOUT_MS, signal } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
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

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => finish(resolve, { lng: round(coords.longitude), lat: round(coords.latitude), accuracy: coords.accuracy }),
      (err) => finish(reject, locationError(err.code === 1 ? "denied" : err.code === 3 ? "timeout" : "unavailable")),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 10_000 },
    );
  });
}

// Plain-language explanation for a rejected getCurrentLocation().
export function describeLocationError(code) {
  switch (code) {
    case "denied":
      return "Location permission was denied. Allow location in your browser and try again.";
    case "timeout":
      return "Couldn't get your location in time. Try again.";
    case "unsupported":
      return "This browser doesn't support location.";
    default:
      return "Your location isn't available right now.";
  }
}
