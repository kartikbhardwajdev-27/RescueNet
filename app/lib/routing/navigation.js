// Helpers for the navigation screens: who can be navigated to, what to warn about,
// how to word times and failures. Pure functions, checked in
// scripts/check-navigation.mjs.

import { shelterHasRoom } from "../nearest.js";
import { haversineM, projectOnSegment } from "./geometry.js";
import { SNAP_LIMIT_M } from "./constants.js";

// A reported incident within this distance of the route is mentioned.
export const ROUTE_INCIDENT_M = 150;
// Every screen that shows a time says it is an estimate.
export const ESTIMATE_NOTE = "Estimated time, not live traffic.";
export const LIMITS_NOTE = "Closures are known only from incidents reported on RescueNet. Roads can be blocked without being reported.";

export const PROFILE_LABEL = { walk: "On foot", drive: "By car" };

// Metres from the start of the route to the start of each step, then to the end: one more
// entry than there are steps (the last step, "arrive", has no length). Used to say how far
// it is to the next turn.
export function stepStarts(steps) {
  const starts = [0];
  for (const step of steps) starts.push(starts[starts.length - 1] + step.distanceM);
  return starts;
}

// Open shelters with at least one free space, as the router wants them: [{ id, lat, lon }].
export function routingCandidates(shelters) {
  return (shelters ?? []).filter(shelterHasRoom).map((shelter) => ({ id: shelter._id, lat: shelter.location.coordinates[1], lon: shelter.location.coordinates[0] }));
}

// "full" | "closed" | null: why a shelter is not a good place to go right now.
export function shelterProblem(shelter) {
  if (!shelter) return null;
  if (shelter.status === "closed") return "closed";
  if (shelter.status === "full" || shelter.occupied >= shelter.capacity) return "full";
  return null;
}

// Active (not resolved) incidents of any kind within radiusM of the route's line, in the
// order the person would pass them: [{ incident, distanceM, alongM }].
export function incidentsAlongRoute(route, incidents, radiusM = ROUTE_INCIDENT_M) {
  const { coordinates } = route;
  if (coordinates.length < 2) return [];
  const along = [0];
  for (let i = 1; i < coordinates.length; i += 1) {
    along.push(along[i - 1] + haversineM(coordinates[i - 1][1], coordinates[i - 1][0], coordinates[i][1], coordinates[i][0]));
  }
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const [lon, lat] of coordinates) {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
  }
  const margin = radiusM / 80_000; // degrees: a little more than the radius at this latitude
  const found = [];
  for (const incident of incidents ?? []) {
    if (incident.status === "resolved") continue;
    const [lon, lat] = incident.location?.coordinates ?? [];
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (lat < minLat - margin || lat > maxLat + margin || lon < minLon - margin || lon > maxLon + margin) continue;
    let best = null;
    for (let i = 0; i < coordinates.length - 1; i += 1) {
      const hit = projectOnSegment(lat, lon, coordinates[i][1], coordinates[i][0], coordinates[i + 1][1], coordinates[i + 1][0]);
      if (!best || hit.distanceM < best.distanceM) best = { distanceM: hit.distanceM, alongM: along[i] + hit.t * (along[i + 1] - along[i]) };
    }
    if (best && best.distanceM <= radiusM) found.push({ incident, distanceM: best.distanceM, alongM: best.alongM });
  }
  return found.sort((a, b) => a.alongM - b.alongM);
}

const TYPE_WORD = { flood: "flood", fire: "fire", earthquake: "earthquake", medical: "medical emergency", other: "incident" };

// What to tell the person about a route's safety.
//   route             an engine result with status "ok"
//   incidents         the incident list
//   shelter           the destination (to say if it is full or closed), or null
// -> [{ id, level, title, detail }], level "warn" (amber). Empty when there is nothing to say.
// Never says a route is safe: only what is known from reported incidents.
export function routeWarnings({ route, incidents, shelter = null }) {
  const warnings = [];
  const crossed = route.crossedZones ?? [];
  if (crossed.length > 0) {
    const kinds = [...new Set(crossed.map((zone) => TYPE_WORD[zone.type] ?? "incident"))].join(", ");
    warnings.push({
      id: "no-safe-route",
      level: "warn",
      title: "No route that avoids reported danger was found",
      detail: `The best route still passes within 200 m of an active ${kinds} (high or critical severity). Roads near such incidents are avoided whenever another route exists. Take great care and follow instructions from local authorities. If you are in danger, call 112.`,
    });
  }
  const along = incidentsAlongRoute(route, incidents);
  if (along.length > 0) {
    const list = along
      .slice(0, 3)
      .map(({ incident, distanceM }) => `${TYPE_WORD[incident.type] ?? "incident"} (${incident.severity}), ${Math.round(distanceM / 10) * 10 || 10} m from the route`)
      .join("; ");
    warnings.push({
      id: "incidents-near-route",
      level: "warn",
      title: `Passes ${along.length === 1 ? "an active incident" : `${along.length} active incidents`}`,
      detail: `${list}${along.length > 3 ? `; and ${along.length - 3} more` : ""}.`,
    });
  }
  const problem = shelterProblem(shelter);
  if (problem) {
    warnings.push({
      id: "shelter-unavailable",
      level: "warn",
      title: `This shelter is ${problem} right now`,
      detail: problem === "full" ? "It has no free spaces. Choose another shelter, or use \"Navigate to nearest shelter\"." : "It is not taking people in. Choose another shelter, or use \"Navigate to nearest shelter\".",
    });
  }
  return warnings;
}

// ---- navigating to an incident ("Navigate here" on an incident) ----

// Active means someone may still be in danger there.
export const isActiveIncident = (incident) => incident?.status === "reported" || incident?.status === "in_progress";

// High and critical active incidents ask for a confirmation before the route starts.
export const incidentNeedsConfirmation = (incident) => isActiveIncident(incident) && (incident.severity === "high" || incident.severity === "critical");

// The route stops at the nearest road, never at the incident itself.
export const INCIDENT_STOP_LABEL = "Nearest road to the incident";
export const INCIDENT_ARRIVAL_NAME = "the nearest road to the incident";
export const ACTIVE_INCIDENT_NOTE = "This is an active incident. Keep a safe distance. If you are in danger, call 112.";

// Avoid zones and "passes an incident" warnings for a trip to `incident`: every incident except
// the destination itself, so the route can reach its own zone but still avoids the others.
export function otherIncidents(incidents, destinationId) {
  return (incidents ?? []).filter((incident) => String(incident._id) !== String(destinationId));
}

// The warning shown in the panel for a destination incident: one entry (or none for a
// resolved incident), in the same shape as routeWarnings.
export function incidentDestinationWarnings(incident) {
  if (!isActiveIncident(incident)) return [];
  return [{ id: "active-incident", level: "warn", title: "This is an active incident", detail: ACTIVE_INCIDENT_NOTE }];
}

// 640 -> "1 min" ... "≈ 12 min", "≈ 1 h 5 min". Always starts with the ≈, because it is an estimate.
export function formatDuration(seconds) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `≈ ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `≈ ${hours} h` : `≈ ${hours} h ${rest} min`;
}

// Why the road route could not be given, in plain words. `code` is one of
//   "graph-missing" "graph-corrupt" "outside-start" "outside-end" "no-route" "failed"
export function fallbackMessage(code) {
  switch (code) {
    case "graph-missing":
      return "The road data isn't on this device yet. Open RescueNet once with the server running to save it.";
    case "graph-corrupt":
      return "The saved road data couldn't be read.";
    case "outside-start":
      return `There is no mapped road within ${SNAP_LIMIT_M} m of your position, or you are outside Chandigarh, Mohali and Panchkula.`;
    case "outside-end":
      return `That shelter is more than ${SNAP_LIMIT_M} m from any mapped road.`;
    case "outside-incident":
      return `That incident is more than ${SNAP_LIMIT_M} m from any mapped road, so there is no road to route to.`;
    case "no-route":
      return "No road route was found between you and the shelter.";
    default:
      return "Road directions aren't available right now.";
  }
}

// A circle on the map as a GeoJSON polygon ring ([[lng, lat], ...]), for drawing avoid zones.
export function circlePolygon(lat, lon, radiusM, points = 48) {
  const ring = [];
  const dLat = radiusM / 111_195;
  const dLon = radiusM / (111_195 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i < points; i += 1) {
    const angle = (2 * Math.PI * i) / points;
    ring.push([lon + dLon * Math.sin(angle), lat + dLat * Math.cos(angle)]);
  }
  ring.push(ring[0]);
  return ring;
}

// Why a failed answer from the router means "show the straight line instead": the code
// fallbackMessage understands. `kind` is "shelter" or "incident" (the end of the trip).
export function routeFailureCode(result, kind = "shelter") {
  if (result.status === "outside-coverage") {
    if (result.where === "end") return kind === "incident" ? "outside-incident" : "outside-end";
    return "outside-start";
  }
  return "no-route";
}
