import { Building2, UserRound } from "lucide-react";
import { ROLE_LABELS } from "./labels";

// Citizen reads as info (blue); organizations get the brand gradient.
export default function RoleBadge({ role }) {
  const isOrg = role === "organization";
  const Icon = isOrg ? Building2 : UserRound;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
        isOrg ? "bg-brand-gradient text-on-brand" : "bg-info/15 text-info"
      }`}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}
