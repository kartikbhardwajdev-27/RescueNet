// Browser-side wrappers around the incident, SOS, shelter and stats endpoints.
//
// They never throw. Each resolves to { ok: true, ... } or
// { ok: false, kind, message, errors }, where `kind` is one of:
//   "network"       the request never reached the server
//   "rate_limit"    HTTP 429
//   "validation"    HTTP 400 (`errors` maps field -> message)
//   "unauthorized"  HTTP 401
//   "forbidden"     HTTP 403
//   "not_found"     HTTP 404
//   "conflict"      HTTP 409: the request was fine but the current state refuses
//                   it (an event is full, already joined, cancelled ...); the
//                   server's own explanation is in `message`
//   "server"        anything else
//   "bad_request"   HTTP 400 on a read (for example a malformed id in the address)
//   "aborted"       the caller cancelled (GET helpers only)
// `message` is ready to show to the user. Failures also carry `status` (the HTTP
// status, 0 when the server was not reached) and `retryAfter` (seconds, from the
// Retry-After header of a 429, else 0), which the offline outbox uses to decide
// whether trying again later makes sense (lib/outboxRules.js).

import { apiFetch } from "./apiClient";
import { recallResponse, rememberResponse, savedEpoch } from "./savedData";

const EMERGENCY_HINT = "If you're in danger, call your local emergency number.";

// Some SOS messages end with the emergency-number reminder. Screens that already
// show that reminder elsewhere use this to avoid saying it twice.
export const withoutEmergencyHint = (message) => String(message).replace(EMERGENCY_HINT, "").trim();
const GENERIC_ERROR = "Something went wrong. Please try again.";

// `headers` are added to the JSON content type. `timeoutMs` turns a request that
// hangs (a phone that wandered out of WiFi range can wait a very long time) into
// a "network" failure instead of leaving the screen waiting.
async function sendJson(method, path, body, { headers, timeoutMs } = {}) {
  const controller = timeoutMs ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await apiFetch(path, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller?.signal,
    });
    const data = await res.json().catch(() => null);
    // A success whose body never arrived (the timeout fired mid-read) is "we
    // did not hear back", not a success: callers read the body.
    if (res.ok && data === null) return { network: true };
    return { status: res.status, ok: res.ok, data, retryAfter: Number(res.headers.get("Retry-After")) || 0 };
  } catch {
    return { network: true };
  } finally {
    clearTimeout(timer);
  }
}

const postJson = (path, body, options) => sendJson("POST", path, body, options);
const patchJson = (path, body, options) => sendJson("PATCH", path, body, options);
const deleteJson = (path, options) => sendJson("DELETE", path, undefined, options);

function failure(response, messages) {
  const serverMessage = response.data?.error;
  const base = { ok: false, status: response.status ?? 0, retryAfter: response.retryAfter ?? 0 };
  if (response.network) return { ...base, kind: "network", message: messages.network, errors: {} };
  if (response.status === 429) return { ...base, kind: "rate_limit", message: messages.rateLimit, errors: {} };
  if (response.status === 400) {
    return { ...base, kind: "validation", message: serverMessage ?? messages.server, errors: response.data?.errors ?? {} };
  }
  if (response.status === 401) return { ...base, kind: "unauthorized", message: serverMessage ?? messages.server, errors: {} };
  if (response.status === 403) return { ...base, kind: "forbidden", message: serverMessage ?? messages.server, errors: {} };
  if (response.status === 404) return { ...base, kind: "not_found", message: serverMessage ?? messages.server, errors: {} };
  if (response.status === 409) return { ...base, kind: "conflict", message: serverMessage ?? messages.server, errors: response.data?.errors ?? {} };
  return { ...base, kind: "server", message: messages.server, errors: {} };
}

// The short code shown to people so they can quote a report or alert.
export function incidentReference(id) {
  return String(id).slice(-6);
}

// ---- incidents and SOS ----

// Both take an optional second argument { idempotencyKey, timeoutMs, capturedAt }.
//   idempotencyKey  with a key the server treats a repeat of the same request as
//                   the same report (see lib/idempotency.js), which is what makes
//                   it safe to retry from the outbox
//   capturedAt      an ISO 8601 time: when the person actually submitted it. The
//                   server keeps it next to its own receive time and ignores it if
//                   it does not trust it (see parseCapturedAt, lib/incidentRules.js)
const withKey = ({ idempotencyKey, timeoutMs } = {}) => ({
  headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
  timeoutMs,
});

// payload: { type, severity, description, location: { lng, lat }, address? }
export async function createIncident(payload, options) {
  const body = options?.capturedAt ? { ...payload, capturedAt: options.capturedAt } : payload;
  const response = await postJson("/api/incidents", body, withKey(options));
  if (response.ok) return { ok: true, incident: response.data };
  return failure(response, {
    network: "Couldn't reach the server",
    rateLimit: "Too many reports, try again shortly",
    server: GENERIC_ERROR,
  });
}

// location: { lng, lat }
export async function sendSos(location, options) {
  const body = { location: { lng: location.lng, lat: location.lat } };
  if (options?.capturedAt) body.capturedAt = options.capturedAt;
  const response = await postJson("/api/sos", body, withKey(options));
  if (response.ok) return { ok: true, id: response.data.id };
  return failure(response, {
    network: `Couldn't reach the server. ${EMERGENCY_HINT}`,
    rateLimit: `Too many SOS alerts sent. Try again shortly. ${EMERGENCY_HINT}`,
    server: `Something went wrong sending your SOS. Try again. ${EMERGENCY_HINT}`,
  });
}

// ---- one incident, "my reports", and changing a status ----

// changes the status of an incident. Organizations only (the server checks).
// status: "in_progress" | "resolved"
export async function updateIncidentStatus(id, status) {
  const response = await patchJson(`/api/incidents/${encodeURIComponent(id)}`, { status });
  if (response.ok) return { ok: true, incident: response.data };
  return failure(response, {
    network: "Couldn't reach the server",
    rateLimit: "Too many requests, try again shortly",
    server: GENERIC_ERROR,
  });
}

// ---- events ----

const EVENT_MESSAGES = {
  network: "Couldn't reach the server",
  rateLimit: "Too many requests, try again shortly",
  server: GENERIC_ERROR,
};

// Organizations only (the server checks).
// payload: { title, description, type, address, location: { lng, lat },
//            startsAt (ISO 8601), endsAt?, capacity? }
export async function createEvent(payload) {
  const response = await postJson("/api/events", payload);
  if (response.ok) return { ok: true, event: response.data };
  return failure(response, EVENT_MESSAGES);
}

// Cancel an event you posted (the record stays, marked cancelled).
export async function cancelEvent(id) {
  const response = await deleteJson(`/api/events/${encodeURIComponent(id)}`);
  if (response.ok) return { ok: true, event: response.data };
  return failure(response, EVENT_MESSAGES);
}

// Join / leave an event (logged-in people). A full, finished or cancelled event,
// or one you already joined, comes back as kind "conflict" with the reason.
export async function joinEvent(id) {
  const response = await postJson(`/api/events/${encodeURIComponent(id)}/rsvp`);
  if (response.ok) return { ok: true, event: response.data };
  return failure(response, EVENT_MESSAGES);
}

export async function leaveEvent(id) {
  const response = await deleteJson(`/api/events/${encodeURIComponent(id)}/rsvp`);
  if (response.ok) return { ok: true, event: response.data };
  return failure(response, EVENT_MESSAGES);
}

// ---- shelters (organizations only) ----

// payload: { name, address, location: { lng, lat }, capacity, occupied?, status?, contactPhone? }
export async function createShelter(payload) {
  const response = await postJson("/api/shelters", payload);
  if (response.ok) return { ok: true, shelter: response.data };
  return failure(response, {
    network: "Couldn't reach the server",
    rateLimit: "Too many shelters added, try again shortly",
    server: GENERIC_ERROR,
  });
}

// changes: any of { occupied, capacity, status }
export async function updateShelter(id, changes) {
  const response = await patchJson(`/api/shelters/${id}`, changes);
  if (response.ok) return { ok: true, shelter: response.data };
  return failure(response, {
    network: "Couldn't reach the server",
    rateLimit: "Too many requests, try again shortly",
    server: GENERIC_ERROR,
  });
}

// ---- reads, for the dashboard and the shelters page ----
// Resolve to { ok: true, data } or { ok: false, kind, message }. Pass
// { signal } to cancel. Defined once at module level so they are stable
// references for usePolledResource.

const READ_FAILURE_KINDS = { 400: "bad_request", 401: "unauthorized", 404: "not_found" };

// The app can keep the last good answer of a few lists (lib/savedData.js; the
// website keeps nothing). When the server cannot be reached, or is failing, the
// read then succeeds with that copy and `savedAt` (ms) says when it was saved, so
// the screen can show "Saved data from <time>, not live". A live answer has no
// `savedAt`.
async function getJson(path, { signal } = {}) {
  const epoch = savedEpoch();
  const fallback = async (failure) => {
    const saved = await recallResponse(path);
    return saved ? { ok: true, data: saved.data, savedAt: saved.savedAt } : failure;
  };
  try {
    const res = await apiFetch(path, { cache: "no-store", signal });
    const data = await res.json().catch(() => null);
    if (res.ok) {
      rememberResponse(path, data, epoch);
      return { ok: true, data };
    }
    const failure = { ok: false, kind: READ_FAILURE_KINDS[res.status] ?? "server", status: res.status, message: data?.error ?? GENERIC_ERROR };
    // Only "the server is failing" falls back to a saved copy: a 401 or 404 is an answer.
    return res.status >= 500 ? await fallback(failure) : failure;
  } catch (err) {
    if (err?.name === "AbortError") return { ok: false, kind: "aborted", message: "" };
    return fallback({ ok: false, kind: "network", message: "Couldn't reach the server" });
  }
}

export const fetchStats = (options) => getJson("/api/stats", options);
export const fetchIncident = (id, options) => getJson(`/api/incidents/${encodeURIComponent(id)}`, options);
// The logged-in person's own reports (401 when logged out).
export const fetchEvents = (options) => getJson("/api/events?limit=200", options);
// { hosting, joined } for the logged-in person (401 when logged out).
export const fetchMyEvents = (options) => getJson("/api/events/mine?limit=200", options);
export const fetchMyIncidents = (options) => getJson("/api/incidents?mine=true&limit=200", options);
export const fetchIncidents = (options) => getJson("/api/incidents?limit=200", options);
export const fetchShelters = (options) => getJson("/api/shelters?limit=200", options);
