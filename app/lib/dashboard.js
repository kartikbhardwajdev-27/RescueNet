// Pure helpers that turn API records into what the Home dashboard shows.
import { distanceKm } from "./geo";
import { isSosIncident } from "./incidentRules";
import { incidentTime } from "./time";

const isActive = (incident) => incident.status !== "resolved";
const toPoint = (record) => ({ lng: record.location.coordinates[0], lat: record.location.coordinates[1] });
// Newest first by the time shown to people: when an incident was actually
// submitted (capturedAt) if it waited in the offline queue, else when the server
// received it. Shelters have only createdAt, which incidentTime falls back to.
const newestFirst = (a, b) => Date.parse(incidentTime(b)) - Date.parse(incidentTime(a));

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

// The latest incidents as timeline entries, newest first by the time they are
// shown with (see newestFirst), so the times read in order down the list.
export function buildActivityItems(incidents = [], { typeLabel, limit = 4 }) {
  return [...incidents].sort(newestFirst).slice(0, limit).map((incident) => {
    const status = ACTIVITY_STATUS[incident.status] ?? ACTIVITY_STATUS.reported;
    const place = incident.address || incident.description;
    // An SOS alert is stored as type "other"; the screen shows a red SOS badge
    // in front of "Alert reported" instead of "Other reported".
    const isSos = isSosIncident(incident);
    return {
      id: incident._id,
      isSos,
      tone: status.tone,
      title: `${isSos ? "Alert" : typeLabel(incident.type)} ${status.suffix}`,
      detail: `${capitalize(incident.severity)} severity · ${place.length > 60 ? `${place.slice(0, 57)}…` : place}`,
      time: incidentTime(incident),
    };
  });
}

export function capitalize(word = "") {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
