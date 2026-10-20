// Browser-side wrappers around POST /api/incidents and POST /api/sos.
//
// They never throw. Each resolves to { ok: true, ... } or
// { ok: false, kind, message, errors }, where `kind` is one of:
//   "network"     the request never reached the server
//   "rate_limit"  HTTP 429
//   "validation"  HTTP 400 (`errors` maps field -> message)
//   "server"      anything else
// `message` is ready to show to the user.

const EMERGENCY_HINT = "If you're in danger, call your local emergency number.";

async function postJson(path, body) {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, ok: res.ok, data: await res.json().catch(() => null) };
  } catch {
    return { network: true };
  }
}

function failure(response, messages) {
  if (response.network) return { ok: false, kind: "network", message: messages.network, errors: {} };
  if (response.status === 429) return { ok: false, kind: "rate_limit", message: messages.rateLimit, errors: {} };
  if (response.status === 400) {
    return {
      ok: false,
      kind: "validation",
      message: response.data?.error ?? messages.server,
      errors: response.data?.errors ?? {},
    };
  }
  return { ok: false, kind: "server", message: messages.server, errors: {} };
}

// The short code shown to people so they can quote a report or alert.
export function incidentReference(id) {
  return String(id).slice(-6);
}

// payload: { type, severity, description, location: { lng, lat }, address? }
export async function createIncident(payload) {
  const response = await postJson("/api/incidents", payload);
  if (response.ok) return { ok: true, incident: response.data };
  return failure(response, {
    network: "Couldn't reach the server",
    rateLimit: "Too many reports, try again shortly",
    server: "Something went wrong. Please try again.",
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
