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
//   "server"        anything else
//   "aborted"       the caller cancelled (GET helpers only)
// `message` is ready to show to the user. Failures also carry `status` (the HTTP
// status, 0 when the server was not reached) and `retryAfter` (seconds, from the
// Retry-After header of a 429, else 0), which the offline outbox uses to decide
// whether trying again later makes sense (lib/outboxRules.js).

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
    const res = await fetch(path, {
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
  return { ...base, kind: "server", message: messages.server, errors: {} };
}

// The short code shown to people so they can quote a report or alert.
export function incidentReference(id) {
  return String(id).slice(-6);
}

// ---- incidents and SOS ----

// Both take an optional second argument { idempotencyKey, timeoutMs }. With a
// key the server treats a repeat of the same request as the same report (see
// lib/idempotency.js), which is what makes it safe to retry from the outbox.
const withKey = ({ idempotencyKey, timeoutMs } = {}) => ({
  headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
  timeoutMs,
});

// payload: { type, severity, description, location: { lng, lat }, address? }
export async function createIncident(payload, options) {
  const response = await postJson("/api/incidents", payload, withKey(options));
  if (response.ok) return { ok: true, incident: response.data };
  return failure(response, {
    network: "Couldn't reach the server",
    rateLimit: "Too many reports, try again shortly",
    server: GENERIC_ERROR,
  });
}

// location: { lng, lat }
export async function sendSos(location, options) {
  const response = await postJson("/api/sos", { location: { lng: location.lng, lat: location.lat } }, withKey(options));
  if (response.ok) return { ok: true, id: response.data.id };
  return failure(response, {
    network: `Couldn't reach the server. ${EMERGENCY_HINT}`,
    rateLimit: `Too many SOS alerts sent. Try again shortly. ${EMERGENCY_HINT}`,
    server: `Something went wrong sending your SOS. Try again. ${EMERGENCY_HINT}`,
  });
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

async function getJson(path, { signal } = {}) {
  try {
    const res = await fetch(path, { cache: "no-store", signal });
    const data = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data };
    return { ok: false, kind: "server", message: data?.error ?? GENERIC_ERROR };
  } catch (err) {
    if (err?.name === "AbortError") return { ok: false, kind: "aborted", message: "" };
    return { ok: false, kind: "network", message: "Couldn't reach the server" };
  }
}

export const fetchStats = (options) => getJson("/api/stats", options);
export const fetchIncidents = (options) => getJson("/api/incidents?limit=200", options);
export const fetchShelters = (options) => getJson("/api/shelters?limit=200", options);
