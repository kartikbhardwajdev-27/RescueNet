// Labels and colours for what the map shows. `tone` keys into home/tones.js for
// badges and legend dots; the marker colours themselves live in map.css
// (.rn-marker[data-tone]) and use the same tones.

// Colour meaning stays strict: blue = info, amber = warning, orange = serious,
// red = emergency, green = safe.
export const SEVERITY_META = {
  low: { label: "Low", tone: "blue" },
  medium: { label: "Medium", tone: "amber" },
  high: { label: "High", tone: "orange" },
  critical: { label: "Critical", tone: "red" },
};

// Neutral for a fresh report, amber while a response is under way, green once
// resolved. (Red stays reserved for emergencies, so it is not used here.)
export const INCIDENT_STATUS_META = {
  reported: { label: "Reported", tone: "muted" },
  in_progress: { label: "Response in progress", tone: "amber" },
  resolved: { label: "Resolved", tone: "green" },
};

// Legend rows, in the order they appear.
export const LEGEND_ITEMS = [
  ...Object.entries(SEVERITY_META).map(([severity, { label, tone }]) => ({ id: severity, label, tone, shape: "dot" })),
  { id: "shelter", label: "Shelter", tone: "green", shape: "square" },
  { id: "you", label: "You", tone: "blue", shape: "you" },
];

export function severityMeta(severity) {
  return SEVERITY_META[severity] ?? SEVERITY_META.medium;
}

export function incidentStatusMeta(status) {
  return INCIDENT_STATUS_META[status] ?? INCIDENT_STATUS_META.reported;
}
