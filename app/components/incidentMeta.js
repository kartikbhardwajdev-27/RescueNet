import { Activity, CircleHelp, Flame, HeartPulse, Siren, Waves } from "lucide-react";
import { capitalize } from "@/lib/dashboard";
import { isSosIncident } from "@/lib/incidentRules";

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

// Label and icon for a whole incident record. An SOS alert is stored with the
// type "other", which would read as "Other"; it gets its own label and icon
// instead (screens also show the red SosBadge in front of the label).
//   -> { label, icon, isSos }
export function incidentKindMeta(incident) {
  if (isSosIncident(incident)) return { label: "SOS alert", icon: Siren, isSos: true };
  return { ...incidentTypeMeta(incident.type), isSos: false };
}
