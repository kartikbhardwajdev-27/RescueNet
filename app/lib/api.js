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
// `message` is ready to show to the user.

const EMERGENCY_HINT = "If you're in danger, call your local emergency number.";
const GENERIC_ERROR = "Something went wrong. Please try again.";

async function sendJson(method, path, body) {
  try {
    const res = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, ok: res.ok, data: await res.json().catch(() => null) };
  } catch {
    return { network: true };
  }
}

const postJson = (path, body) => sendJson("POST", path, body);
const patchJson = (path, body) => sendJson("PATCH", path, body);

function failure(response, messages) {
  const serverMessage = response.data?.error;
  if (response.network) return { ok: false, kind: "network", message: messages.network, errors: {} };
  if (response.status === 429) return { ok: false, kind: "rate_limit", message: messages.rateLimit, errors: {} };
  if (response.status === 400) {
    return { ok: false, kind: "validation", message: serverMessage ?? messages.server, errors: response.data?.errors ?? {} };
  }
  if (response.status === 401) return { ok: false, kind: "unauthorized", message: serverMessage ?? messages.server, errors: {} };
  if (response.status === 403) return { ok: false, kind: "forbidden", message: serverMessage ?? messages.server, errors: {} };
  if (response.status === 404) return { ok: false, kind: "not_found", message: serverMessage ?? messages.server, errors: {} };
  return { ok: false, kind: "server", message: messages.server, errors: {} };
}

// The short code shown to people so they can quote a report or alert.
export function incidentReference(id) {
  return String(id).slice(-6);
}

// ---- incidents and SOS ----

// payload: { type, severity, description, location: { lng, lat }, address? }
export async function createIncident(payload) {
  const response = await postJson("/api/incidents", payload);
  if (response.ok) return { ok: true, incident: response.data };
  return failure(response, {
    network: "Couldn't reach the server",
    rateLimit: "Too many reports, try again shortly",
    server: GENERIC_ERROR,
  });
}

// location: { lng, lat }
export async function sendSos(location) {
  const response = await postJson("/api/sos", { location: { lng: location.lng, lat: location.lat } });
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
