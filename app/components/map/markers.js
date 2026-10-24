import { incidentTypeMeta } from "@/components/incidentMeta";
import { SHELTER_STATUS_META } from "@/components/shelters/statusMeta";
import { incidentStatusMeta, severityMeta } from "./mapMeta";

// Marker elements for MapLibre, built with the DOM API (not React): MapLibre
// owns their position, and building them here keeps their lifecycle out of
// React state. Looks live in map.css (.rn-marker*).
//
// Incidents are circles coloured by severity (critical also pulses); shelters
// are green rounded squares with a house, so the two differ by shape and not
// only by colour.

// Static, trusted markup (no data in it).
const HOUSE_SVG =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11 12 3l9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>';

// Critical sits on top of the rest when markers overlap.
const SEVERITY_Z = { low: 1, medium: 2, high: 3, critical: 4 };

function span(className, text) {
  const node = document.createElement("span");
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

function markerButton(kind, tone, label) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = `rn-marker rn-marker-${kind}`;
  el.dataset.tone = tone;
  el.setAttribute("aria-label", label);
  return el;
}

export const pointOf = (record) => record.location.coordinates;

// What a marker looks like depends on these; the map rebuilds it only when
// this string changes, so a refresh with identical data touches nothing.
export function markerSignature(kind, record) {
  const [lng, lat] = pointOf(record);
  return kind === "incident"
    ? `${record.severity}|${record.status}|${record.type}|${lng},${lat}`
    : `${record.status}|${record.name}|${lng},${lat}`;
}

export function createIncidentMarker(incident) {
  const { tone, label: severity } = severityMeta(incident.severity);
  const type = incidentTypeMeta(incident.type).label;
  const status = incidentStatusMeta(incident.status).label.toLowerCase();

  const el = markerButton("incident", tone, `${type} incident, ${severity.toLowerCase()} severity, ${status}`);
  el.style.zIndex = String(SEVERITY_Z[incident.severity] ?? 2);
  if (incident.severity === "critical") el.append(span("rn-pulse"));
  el.append(span("rn-dot", "!"));
  return el;
}

export function createShelterMarker(shelter) {
  const status = (SHELTER_STATUS_META[shelter.status] ?? SHELTER_STATUS_META.open).label.toLowerCase();

  const el = markerButton("shelter", "green", `Shelter: ${shelter.name}, ${status}`);
  if (shelter.status === "closed") el.classList.add("is-closed");
  el.style.zIndex = "1";
  const dot = span("rn-dot");
  dot.innerHTML = HOUSE_SVG;
  el.append(dot);
  return el;
}

// The person's own position. Not interactive, so it never blocks a tap.
export function createUserMarker() {
  const el = document.createElement("div");
  el.className = "rn-user";
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", "Your location");
  el.style.zIndex = "5";
  el.append(span("rn-user-halo"), span("rn-user-dot"));
  return el;
}
