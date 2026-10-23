// Pure helpers that turn API records into what the Home dashboard shows.
import { distanceKm } from "./geo";

const isActive = (incident) => incident.status !== "resolved";
const toPoint = (record) => ({ lng: record.location.coordinates[0], lat: record.location.coordinates[1] });
const newestFirst = (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt);

// The closest open shelters and active incidents, merged into one list.
// With a location each item gets `distanceKm` and the list is nearest first;
// without one, items carry no distance and the list is newest first.
export function buildNearbyItems({ shelters = [], incidents = [], location = null, shelterCount = 3, incidentCount = 2 }) {
  const withDistance = (kind, records) =>
    records.map((record) => ({
      kind,
      id: record._id,
      record,
      distanceKm: location ? distanceKm(location, toPoint(record)) : null,
    }));

  const closest = (items, count) =>
    [...items].sort(location ? (a, b) => a.distanceKm - b.distanceKm : (a, b) => newestFirst(a.record, b.record)).slice(0, count);

  const items = [
    ...closest(withDistance("shelter", shelters.filter((s) => s.status === "open")), shelterCount),
    ...closest(withDistance("incident", incidents.filter(isActive)), incidentCount),
  ];
  return items.sort(location ? (a, b) => a.distanceKm - b.distanceKm : (a, b) => newestFirst(a.record, b.record));
}

// What each incident status looks like in the activity timeline.
// Tones keep their meaning: red = emergency, amber = warning, green = safe.
const ACTIVITY_STATUS = {
  reported: { tone: "red", suffix: "reported" },
  in_progress: { tone: "amber", suffix: "response in progress" },
  resolved: { tone: "green", suffix: "resolved" },
};

// The latest incidents (newest first, as the API returns them), as timeline entries.
export function buildActivityItems(incidents = [], { typeLabel, limit = 4 }) {
  return incidents.slice(0, limit).map((incident) => {
    const status = ACTIVITY_STATUS[incident.status] ?? ACTIVITY_STATUS.reported;
    const place = incident.address || incident.description;
    return {
      id: incident._id,
      tone: status.tone,
      title: `${typeLabel(incident.type)} ${status.suffix}`,
      detail: `${capitalize(incident.severity)} severity · ${place.length > 60 ? `${place.slice(0, 57)}…` : place}`,
      createdAt: incident.createdAt,
    };
  });
}

export function capitalize(word = "") {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

// Scales { lng, lat } points to x / y percentages of their own bounding box (y
// grows downward), with a margin so edge points aren't clipped. A tiny or empty
// spread is widened to `minSpan` degrees so one point sits in the middle
// instead of being zoomed to nothing.
export function plotPoints(points, { margin = 0.1, minSpan = 0.02 } = {}) {
  if (points.length === 0) return [];
  const lngs = points.map((p) => p.lng);
  const lats = points.map((p) => p.lat);
  const midLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const width = Math.max(Math.max(...lngs) - Math.min(...lngs), minSpan) * (1 + margin * 2);
  const height = Math.max(Math.max(...lats) - Math.min(...lats), minSpan) * (1 + margin * 2);
  return points.map((p) => ({
    ...p,
    x: ((p.lng - (midLng - width / 2)) / width) * 100,
    y: (1 - (p.lat - (midLat - height / 2)) / height) * 100,
  }));
}
