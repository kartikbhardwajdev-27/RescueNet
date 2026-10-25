// How the Android app talks to the laptop.
//
// A page served by the app itself lives at https://localhost, so the WebView
// would refuse a plain-http request to http://192.168.x.x as "mixed content", and
// has no way to send a login cookie to another address. Both go away by making
// the request natively with CapacitorHttp (Android's own HttpURLConnection, not
// the WebView):
//   - plain http:// to the laptop works (cleartext is allowed in the Android
//     project; see docs/SECURITY.md for the trade-off)
//   - CORS does not apply to native requests, so the server needs no CORS
//     headers at all and the browser rules stay exactly as strict as they were
//   - login is a bearer token (Authorization: Bearer <jwt>) kept in Preferences
//
// `nativeFetch` returns a small object shaped like a fetch Response (ok, status,
// headers.get, json), so lib/api.js and the rest of the app need no second code
// path. Global fetch is NOT patched (the CapacitorHttp "enabled" config stays
// off): the app's own files, the map tiles and the glyphs must keep loading from
// the app, not the laptop.
//
// Android app only: part of mobile/overlay, used by the app's lib/apiClient.js.

import { CapacitorHttp } from "@capacitor/core";
import { normalizeServerAddress } from "../serverAddress";
import { getServerUrl, getToken } from "./storage";

const CONNECT_TIMEOUT_MS = 10_000;
const READ_TIMEOUT_MS = 20_000;

function abortError() {
  return new DOMException("The request was cancelled", "AbortError");
}

// Resolves with `promise`, or rejects with an AbortError as soon as `signal`
// fires. The native request itself cannot be cancelled, so it simply finishes
// unheard.
function raceAbort(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

function responseLike({ status, headers, data }) {
  const lower = {};
  for (const [name, value] of Object.entries(headers ?? {})) lower[name.toLowerCase()] = value;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => lower[String(name).toLowerCase()] ?? null },
    // Like Response.json(): rejects when the body is not JSON.
    json: async () => {
      if (typeof data === "string") return JSON.parse(data);
      if (data === undefined || data === null) throw new SyntaxError("Unexpected end of JSON input");
      return data;
    },
  };
}

function requestBody(body, headers) {
  if (body === undefined || body === null) return undefined;
  // Everything the app sends is JSON text. Native code takes JSON as a value.
  if (typeof body === "string" && /json/i.test(headers["Content-Type"] ?? "")) {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
  return body;
}

// Same call shape as fetch(path, init) for the parts the app uses: method,
// headers, body (a JSON string) and signal. Rejects (like fetch does when it
// cannot reach the server) when there is no address or the server is unreachable.
export async function nativeFetch(path, init = {}) {
  const base = getServerUrl();
  if (!base) throw new TypeError("No laptop address is set");
  // The form only saves addresses that pass normalizeServerAddress, but this is
  // the line between the app and the network: re-check, so a changed or damaged
  // saved value can never lead to plain http to a public host.
  if (normalizeServerAddress(base).url !== base) throw new TypeError("The saved laptop address is not valid");
  // Only ever "/api/..." on the saved address: never another host, which could
  // otherwise receive the login token.
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) {
    throw new TypeError("Not an app path");
  }

  const headers = { Accept: "application/json" };
  for (const [name, value] of Object.entries(init.headers ?? {})) headers[name] = value;
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const request = CapacitorHttp.request({
    url: `${base}${path}`,
    method: (init.method ?? "GET").toUpperCase(),
    headers,
    data: requestBody(init.body, headers),
    responseType: "text",
    connectTimeout: CONNECT_TIMEOUT_MS,
    readTimeout: READ_TIMEOUT_MS,
  });
  return responseLike(await raceAbort(request, init.signal));
}

// The Test button. Asks the address in `url` (already normalised, and not
// necessarily saved yet) for /api/health, without any login. Resolves
//   { state: "ok" }            RescueNet answered and its database is up
//   { state: "db_down" }       RescueNet answered, its database did not
//   { state: "not_rescuenet" } something answered, but it is not RescueNet
//   { state: "unreachable" }   nothing answered in time
export async function testServer(url) {
  try {
    const response = await CapacitorHttp.request({
      url: `${url}/api/health`,
      method: "GET",
      headers: { Accept: "application/json" },
      responseType: "text",
      connectTimeout: 6000,
      readTimeout: 6000,
    });
    let body = response.data;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        body = null;
      }
    }
    if (response.status !== 200 || body?.status !== "ok") return { state: "not_rescuenet" };
    return { state: body.db === "connected" ? "ok" : "db_down" };
  } catch {
    return { state: "unreachable" };
  }
}
