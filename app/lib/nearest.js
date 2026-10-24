// Nearest shelter guidance. Straight-line only: there is no routing engine here
// and none can work offline, so everything says "straight-line distance, not a
// road route". Pure functions (no React, no browser), so the maths can be
// checked on its own: `npm run check:nearest`.

import { distanceKm, getCurrentLocation } from "./geo.js";

// A shelter this close to an active high or critical incident gets a warning.
export const NEAR_INCIDENT_KM = 2;
export const DANGEROUS_SEVERITIES = ["high", "critical"];
export const STRAIGHT_LINE_NOTE = "Straight-line distance, not a road route.";

// Closer than this and "which way" means nothing.
const SAME_PLACE_KM = 0.02;

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const COMPASS_WORDS = {
  N: "north",
  NE: "north-east",
  E: "east",
  SE: "south-east",
  S: "south",
  SW: "south-west",
  W: "west",
  NW: "north-west",
};

const rad = (deg) => (deg * Math.PI) / 180;

// The direction to head in from `from` to reach `to`, in degrees clockwise from
// north (0 = north, 90 = east, 180 = south, 270 = west). Both are { lng, lat }.
// This is the initial great-circle bearing.
export function bearingDegrees(from, to) {
  const dLng = rad(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(rad(to.lat));
  const x = Math.cos(rad(from.lat)) * Math.sin(rad(to.lat)) - Math.sin(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.cos(dLng);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

// 0..360 degrees -> "N", "NE", "E", "SE", "S", "SW", "W" or "NW".
export function compassDirection(degrees) {
  const normal = ((degrees % 360) + 360) % 360;
  return COMPASS[Math.round(normal / 45) % 8];
}

// "NE" -> "north-east", for screen readers and sentences.
export const compassWord = (direction) => COMPASS_WORDS[direction] ?? "";

const pointOf = (record) => ({ lng: record.location.coordinates[0], lat: record.location.coordinates[1] });

// A shelter a person can be sent to: open, with at least one free space.
export const shelterHasRoom = (shelter) => shelter.status === "open" && shelter.occupied < shelter.capacity;

// The nearest shelter that is open and has room, by straight-line distance.
// Returns { shelter, distanceKm, bearing, direction } or null when there is none.
// `direction` is null when the person is already at the shelter.
export function findNearestShelter(from, shelters) {
  let best = null;
  for (const shelter of shelters) {
    if (!shelterHasRoom(shelter)) continue;
    const km = distanceKm(from, pointOf(shelter));
    // _id breaks an exact tie, so the answer does not depend on list order.
    if (!best || km < best.distanceKm || (km === best.distanceKm && String(shelter._id) < String(best.shelter._id))) {
      best = { shelter, distanceKm: km };
    }
  }
  if (!best) return null;
  const bearing = bearingDegrees(from, pointOf(best.shelter));
  return { ...best, bearing, direction: best.distanceKm < SAME_PLACE_KM ? null : compassDirection(bearing) };
}

// Active (not resolved) high or critical incidents within `radiusKm` of a point,
// nearest first: [{ incident, distanceKm }].
export function dangerousIncidentsNear(point, incidents, radiusKm = NEAR_INCIDENT_KM) {
  const found = [];
  for (const incident of incidents) {
    if (incident.status === "resolved") continue;
    if (!DANGEROUS_SEVERITIES.includes(incident.severity)) continue;
    const km = distanceKm(point, pointOf(incident));
    if (km <= radiusKm) found.push({ incident, distanceKm: km });
  }
  return found.sort((a, b) => a.distanceKm - b.distanceKm);
}

// For a list of shelters: shelter id -> { count, nearestKm } for every shelter
// with an active high or critical incident within 2 km. Shelters without one
// are not in the map.
export function shelterWarnings(shelters, incidents) {
  const warnings = new Map();
  for (const shelter of shelters) {
    const near = dangerousIncidentsNear(pointOf(shelter), incidents);
    if (near.length > 0) warnings.set(shelter._id, { count: near.length, nearestKm: near[0].distanceKm });
  }
  return warnings;
}

// Everything the screens show about "the nearest shelter" for a person at
// `from`: the shelter, how far, which way, a warning if it is near an incident,
// and the two ends of the line to draw. null when no shelter is open with room.
//   source  where `from` came from: "device" or "saved" (shown to the person)
export function buildGuidance({ from, source, shelters, incidents }) {
  const nearest = findNearestShelter(from, shelters);
  if (!nearest) return null;
  const target = pointOf(nearest.shelter);
  const nearIncidents = dangerousIncidentsNear(target, incidents);
  return {
    ...nearest,
    from,
    source,
    target,
    line: [
      [from.lng, from.lat],
      [target.lng, target.lat],
    ],
    warning: nearIncidents.length > 0 ? { count: nearIncidents.length, nearestKm: nearIncidents[0].distanceKm } : null,
  };
}

// "850 m NE", "3.4 km SW", or "here" when the person is at the shelter.
export function formatGuidance(km, direction, formatDistance) {
  return direction ? `${formatDistance(km)} ${direction}` : "right here";
}

export const NEED_LOCATION_MESSAGE =
  "Allow location in your browser so we can find the nearest shelter, or log in with an account that has a saved location.";

// Where to measure from: the device's location if the browser can give it, else
// the account's saved one, else nothing (the caller then asks the person to
// allow location). `device` is a location already known. `saved` is
// { lng, lat } or null. `getLocation` is injectable for the checks.
//   -> { ok: true, point, source: "device" | "saved" } or { ok: false, code }
export async function resolveStartPoint({ device, saved, getLocation = getCurrentLocation }) {
  if (device) return { ok: true, point: { lng: device.lng, lat: device.lat }, source: "device" };
  try {
    const found = await getLocation({ highAccuracy: false, maxAgeMs: 60_000 });
    return { ok: true, point: { lng: found.lng, lat: found.lat }, source: "device" };
  } catch (err) {
    if (saved) return { ok: true, point: { lng: saved.lng, lat: saved.lat }, source: "saved" };
    return { ok: false, code: err?.code ?? "unavailable" };
  }
}
