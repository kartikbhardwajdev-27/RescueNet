import { Siren } from "lucide-react";

// The red "SOS" mark shown wherever an incident's type would otherwise read
// "Other". Solid red with white text: red is reserved for SOS and emergencies,
// and white on this red passes WCAG AA, so it stays legible at a glance.
export default function SosBadge({ className = "" }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-sos px-2.5 py-0.5 align-middle text-xs font-extrabold tracking-wide text-white ${className}`}
    >
      <Siren className="size-3" aria-hidden="true" />
      SOS
    </span>
  );
}
