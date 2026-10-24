// "Just now", "4 min ago", "3 h ago", "2 d ago". `nowMs` is passed in, not read
// here, so rendering stays pure and the text only changes when data is refreshed.
export function formatRelativeTime(iso, nowMs) {
  const minutes = Math.floor(Math.max(0, nowMs - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

// The time to show for an incident: when the person actually submitted it
// (capturedAt, set for reports that waited in the offline queue) or, when there
// is none, when the server received it (createdAt). Returns an ISO string.
export function incidentTime(incident) {
  return incident.capturedAt ?? incident.createdAt;
}
