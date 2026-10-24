import { TriangleAlert } from "lucide-react";
import { formatDistance } from "@/lib/geo";
import { NEAR_INCIDENT_KM } from "@/lib/nearest";

// Amber warning: a high or critical incident is still active within 2 km of this
// shelter. `warning` is { count, nearestKm } (see shelterWarnings in lib/nearest.js).
// It is a warning, not a ban: the shelter may still be the right place to go.
export default function NearIncidentBadge({ warning, withDistance = false }) {
  const many = warning.count === 1 ? "an active high or critical incident" : `${warning.count} active high or critical incidents`;
  return (
    <span
      title={`${many} within ${NEAR_INCIDENT_KM} km, the nearest ${formatDistance(warning.nearestKm)} away`}
      className="inline-flex items-center gap-1.5 rounded-full bg-warn/15 px-2.5 py-1 text-xs font-bold text-warn"
    >
      <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
      Near an active incident
      {withDistance && <span className="font-semibold opacity-90">· {formatDistance(warning.nearestKm)} away</span>}
    </span>
  );
}
