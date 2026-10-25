// How this client keeps a person logged in, as far as AuthProvider is concerned.
//
// This is the website's version, and the website needs none of it: the server
// sets a login cookie and the browser sends it back, so every function here does
// nothing. The Android app is built with mobile/overlay/lib/clientSession.js in
// its place (scripts/build-mobile.mjs), which keeps a bearer token on the phone
// instead. Keep the exports identical.

// What to send to log in or register: the website sends the form as it is.
export function signInBody(body) {
  return body;
}

// Called with the server's answer to a login or registration { ok, status, data }.
// Returns the answer to show to the form. Nothing to keep for a cookie.
export async function keepSignIn(response) {
  return response;
}

// The server said this client is not logged in (401).
export async function notLoggedIn() {}

// Log out on this client without needing the server. Resolves true when that is
// all there is to do. The website has to ask the server to drop its cookie.
export async function signOutHere() {
  return false;
}
