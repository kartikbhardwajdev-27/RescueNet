// The one place the app's own API is called from. Everything that used to call
// fetch("/api/...") directly goes through apiFetch instead.
//
// This is the website's version: exactly fetch(path, init), same URL, same
// cookie, same behaviour as before the Android app existed.
//
// The Android app is built with mobile/overlay/lib/apiClient.js in its place
// (scripts/build-mobile.mjs): the same function, but the request goes to the
// laptop's address through CapacitorHttp with the login token. Keep the two
// exports identical. Like fetch, it rejects when the server cannot be reached.
export function apiFetch(path, init) {
  return fetch(path, init);
}
