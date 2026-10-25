// What the Android app remembers between launches, kept with the Capacitor
// Preferences plugin (Android SharedPreferences, private to this app):
//
//   serverUrl   the laptop's address, set on the first-run screen or in Settings
//   token       the login token (a JWT) the server handed out when asked
//   setupDone   the first-run screen has been answered (saved or skipped)
//
// Android app only (mobile/overlay). Everything is read
// into memory once (loadSettings), so the rest of the app can ask synchronously,
// and written through to Preferences when it changes.
//
// The token sits in Preferences unencrypted, like a cookie sits in a browser's
// profile: it protects against other apps and other people on the network, not
// against someone with root on the phone. See docs/SECURITY.md.

import { Preferences } from "@capacitor/preferences";
import { forgetSavedData } from "../savedData";

const KEYS = {
  serverUrl: "rescuenet.serverUrl",
  token: "rescuenet.token",
  setupDone: "rescuenet.setupDone",
};

const state = { loaded: false, serverUrl: "", token: "", setupDone: false };
let loading = null;
const listeners = new Set();

function notify() {
  for (const listener of listeners) listener();
}

async function read(key) {
  try {
    return (await Preferences.get({ key })).value ?? "";
  } catch {
    return "";
  }
}

// Reads everything once. Safe to call from several places at the same time.
export function loadSettings() {
  loading ??= (async () => {
    const [serverUrl, token, setupDone] = await Promise.all([
      read(KEYS.serverUrl),
      read(KEYS.token),
      read(KEYS.setupDone),
    ]);
    state.serverUrl = serverUrl;
    state.token = token;
    state.setupDone = setupDone === "1";
    state.loaded = true;
    notify();
    return { ...state };
  })();
  return loading;
}

export const isLoaded = () => state.loaded;
export const getServerUrl = () => state.serverUrl;
export const getToken = () => state.token;
export const isSetupDone = () => state.setupDone;

// A snapshot for useSyncExternalStore: a new object only when something changed.
let snapshot = null;
export function getSnapshot() {
  if (!snapshot || snapshot.loaded !== state.loaded || snapshot.serverUrl !== state.serverUrl || snapshot.setupDone !== state.setupDone) {
    snapshot = { loaded: state.loaded, serverUrl: state.serverUrl, setupDone: state.setupDone };
  }
  return snapshot;
}
export const SERVER_SNAPSHOT = { loaded: false, serverUrl: "", setupDone: false };

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function write(key, value) {
  try {
    if (value === "") await Preferences.remove({ key });
    else await Preferences.set({ key, value });
  } catch {
    // Storage refused: the value still holds for this run of the app.
  }
}

// Saving the first-run answer and the address go together: either way the
// screen has been answered. Changing to a different server drops the login,
// because that token was issued by the old server and must not be sent to a new one.
// Resolves { changed, signedOut }: the address differs from before, and a login
// was dropped because of it.
export async function saveServerUrl(url) {
  const changed = url !== state.serverUrl;
  const signedOut = changed && state.token !== "";
  state.serverUrl = url;
  state.setupDone = true;
  if (changed) state.token = "";
  notify();
  await Promise.all([
    write(KEYS.serverUrl, url),
    write(KEYS.setupDone, "1"),
    // The saved lists belong to the old server: drop them with the login.
    changed ? write(KEYS.token, "") : Promise.resolve(),
    changed ? forgetSavedData() : Promise.resolve(),
  ]);
  return { changed, signedOut };
}

// "Skip for now" on the first-run screen: no address yet, the app works from
// what is saved on the device.
export async function markSetupDone() {
  state.setupDone = true;
  notify();
  await write(KEYS.setupDone, "1");
}

export async function saveToken(token) {
  state.token = token;
  await write(KEYS.token, token);
}

export async function clearToken() {
  state.token = "";
  await write(KEYS.token, "");
}
