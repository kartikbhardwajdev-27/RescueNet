// Deep links into the map: /map?focus=incident:<id> or /map?focus=shelter:<id>
// flies to that item and opens its popup. Pure, so the Home and Shelters links
// and the map page agree on the format.

export const FOCUS_KINDS = ["incident", "shelter"];

const FOCUS_PATTERN = /^(incident|shelter):([\w-]{1,64})$/;

// "/map?focus=shelter:abc123". Without an id, plain "/map".
export function mapHref(kind, id) {
  return id ? `/map?focus=${kind}:${id}` : "/map";
}

// "incident:abc123" -> { kind: "incident", id: "abc123", raw }, or null when
// missing or malformed (the map then just fits all its data).
export function parseFocus(value) {
  const match = FOCUS_PATTERN.exec(value ?? "");
  return match ? { kind: match[1], id: match[2], raw: value } : null;
}

// ---- navigation links ----
//
// /map?navigate=shelter:<id> or /map?navigate=incident:<id> opens the map and starts
// road directions to that place (the "Navigate here" buttons). /map?nearest=1 starts
// them to the nearest open shelter with room.

const NAVIGATE_PATTERN = /^(shelter|incident):([\w-]{1,64})$/;

export const navigateHref = (shelterId) => `/map?navigate=shelter:${shelterId}`;
export const navigateIncidentHref = (incidentId) => `/map?navigate=incident:${incidentId}`;

// "shelter:abc123" -> { kind: "shelter", id: "abc123", raw }, or null when missing or malformed.
export function parseNavigate(value) {
  const match = NAVIGATE_PATTERN.exec(value ?? "");
  return match ? { kind: match[1], id: match[2], raw: value } : null;
}
