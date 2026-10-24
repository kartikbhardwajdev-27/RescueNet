import { toneClasses } from "@/components/home/tones";
import { incidentStatusMeta, severityMeta } from "@/components/map/mapMeta";

// The same labels and colours as the map: blue low, amber medium, orange high,
// red critical; a fresh report is neutral, a response in progress amber, resolved green.
const badge = (tone) => `rounded-full px-2.5 py-1 text-xs font-bold ${toneClasses(tone).badge}`;

export function SeverityBadge({ severity }) {
  const { label, tone } = severityMeta(severity);
  return <span className={badge(tone)}>{label} severity</span>;
}

export function StatusBadge({ status }) {
  const { label, tone } = incidentStatusMeta(status);
  return <span className={badge(tone)}>{label}</span>;
}

// The level alone ("High"), used where the word "severity" would be wrong, such
// as a suggested priority.
export function PriorityBadge({ severity }) {
  const { label, tone } = severityMeta(severity);
  return <span className={badge(tone)}>{label}</span>;
}
