import { Activity, CircleHelp, Flame, HeartPulse, Waves } from "lucide-react";
import { capitalize } from "@/lib/dashboard";

// Labels and icons for the incident types in lib/incidentRules.js.
export const INCIDENT_TYPE_META = {
  flood: { label: "Flood", icon: Waves },
  fire: { label: "Fire", icon: Flame },
  earthquake: { label: "Earthquake", icon: Activity },
  medical: { label: "Medical", icon: HeartPulse },
  other: { label: "Other", icon: CircleHelp },
};

export function incidentTypeMeta(type) {
  return INCIDENT_TYPE_META[type] ?? { label: capitalize(type), icon: CircleHelp };
}
