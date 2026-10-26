// Where the device's location comes from.
//
// This is the website's version: the browser's own navigator.geolocation, used
// exactly as before. The Android app is built with
// mobile/overlay/lib/devicePosition.js in its place (scripts/build-mobile.mjs),
// which has the same shape but asks Android through the Capacitor Geolocation
// plugin, with the proper Android location permission. Keep the exports identical.
//
// deviceGeolocation() returns something with navigator.geolocation's
// getCurrentPosition(success, failure, options) (success gets { coords: {
// latitude, longitude, accuracy } }, failure gets { code } with 1 = permission
// denied, 2 = unavailable, 3 = timeout), or undefined when there is no location
// support at all.
export const deviceGeolocation = () => (typeof navigator === "undefined" ? undefined : navigator.geolocation);

// The end of the "permission was denied" message: where to turn location back on.
export const LOCATION_DENIED_HELP = "Allow location in your browser and try again.";

// Follows the device's position (the "Start" mode of road directions).
//   onFix({ lat, lon, accuracy })   for every new position; accuracy is in metres
//   onError(code)                    "denied" | "unavailable" | "timeout" | "unsupported"
// Returns stop(), which ends the watching. The browser keeps sending positions only
// while the page is open and the screen is on.
export function watchDevicePosition(onFix, onError, { highAccuracy = true } = {}) {
  const geolocation = deviceGeolocation();
  if (!geolocation || typeof geolocation.watchPosition !== "function") {
    onError?.("unsupported");
    return () => {};
  }
  const id = geolocation.watchPosition(
    ({ coords }) => onFix({ lat: coords.latitude, lon: coords.longitude, accuracy: coords.accuracy }),
    (error) => onError?.(error.code === 1 ? "denied" : error.code === 3 ? "timeout" : "unavailable"),
    { enableHighAccuracy: highAccuracy, maximumAge: 2000, timeout: 20_000 },
  );
  return () => geolocation.clearWatch(id);
}
