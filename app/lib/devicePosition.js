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
