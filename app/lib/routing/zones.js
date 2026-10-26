// Avoid zones: which incidents make the roads around them worth avoiding.
// Pure and tiny, used by the screens (to draw and to ask for routes) and the tests.

import { ZONE_RADIUS_M } from "./constants.js";

// Incidents that make a road dangerous to route through.
export const AVOID_TYPES = ["flood", "fire", "earthquake"];
export const AVOID_SEVERITIES = ["high", "critical"];

// Turns incidents (as the API returns them: { _id, type, severity, status,
// location: { coordinates: [lng, lat] } }) into avoid zones. Resolved incidents and
// other types or severities make none.
export function zonesFromIncidents(incidents, radiusM = ZONE_RADIUS_M) {
  const zones = [];
  for (const incident of incidents ?? []) {
    if (incident.status === "resolved") continue;
    if (!AVOID_TYPES.includes(incident.type) || !AVOID_SEVERITIES.includes(incident.severity)) continue;
    const coordinates = incident.location?.coordinates;
    if (!Array.isArray(coordinates) || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) continue;
    zones.push({ id: String(incident._id), type: incident.type, severity: incident.severity, lat: coordinates[1], lon: coordinates[0], radiusM });
  }
  return zones;
}
