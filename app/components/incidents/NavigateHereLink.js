import Link from "next/link";
import { Navigation } from "lucide-react";
import { navigateIncidentHref } from "@/lib/mapFocus";

// "Navigate here" for an incident: opens the map and starts road directions to the nearest
// road (the map asks for confirmation first when the incident is active and high or critical).
//   compact   a small button for list rows; otherwise the large one used on the incident page
export default function NavigateHereLink({ incidentId, label = "incident", compact = false }) {
  const size = compact ? "px-3 py-1.5 text-xs" : "px-4 py-2.5 text-sm";
  return (
    <Link
      href={navigateIncidentHref(incidentId)}
      aria-label={`Navigate here: ${label}`}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-brand-gradient font-bold text-on-brand shadow-brand transition-all duration-150 hover:brightness-110 motion-safe:active:scale-95 ${size}`}
    >
      <Navigation className={compact ? "size-3.5" : "size-4"} aria-hidden="true" />
      Navigate here
    </Link>
  );
}
