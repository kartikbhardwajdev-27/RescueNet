// The Android app's login handling. Replaces lib/clientSession.js (which does
// nothing, because the website's login is a cookie) in the app build; the two
// must export the same functions.
//
// The app cannot use the server's cookie: its pages are not served from the
// server's origin. Instead it asks for the token when it logs in or registers
// (returnToken), keeps it with the Capacitor Preferences plugin, and
// lib/native/http.js sends it as `Authorization: Bearer <jwt>`.
import { clearToken, getToken, saveToken } from "./native/storage";

const OLD_SERVER_ERROR = "This server is too old for the app. Update RescueNet on the laptop and try again.";

export function signInBody(body) {
  return { ...body, returnToken: true };
}

// `response` is { ok, status, data }. On success the token is taken out of the
// body and kept, so the user the screens see never carries it.
export async function keepSignIn(response) {
  if (!response.ok) return response;
  const { token, ...user } = response.data ?? {};
  if (typeof token !== "string" || token === "") {
    return { ok: false, status: 0, data: { error: OLD_SERVER_ERROR } };
  }
  await saveToken(token);
  return { ...response, data: user };
}

// The server said the token is not valid (expired, or from another server): stop
// sending it.
export async function notLoggedIn() {
  if (getToken()) await clearToken();
}

// The login lives on this phone, so logging out always works here, even with the
// laptop out of reach.
export async function signOutHere() {
  await notLoggedIn();
  return true;
}
