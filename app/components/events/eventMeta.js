import { CalendarDays, GraduationCap, HandHeart, Megaphone, PackageOpen } from "lucide-react";
import { EVENT_TYPES } from "@/lib/eventRules";

// Label and icon for each event type (lib/eventRules.js).
export const EVENT_TYPE_META = {
  volunteer_drive: { label: "Volunteer drive", icon: HandHeart },
  donation_camp: { label: "Donation camp", icon: PackageOpen },
  training: { label: "Training", icon: GraduationCap },
  awareness: { label: "Awareness", icon: Megaphone },
  other: { label: "Other", icon: CalendarDays },
};

export const EVENT_FILTERS = [{ value: "all", label: "All" }, ...EVENT_TYPES.map((value) => ({ value, label: EVENT_TYPE_META[value].label }))];

export function eventTypeMeta(type) {
  return EVENT_TYPE_META[type] ?? EVENT_TYPE_META.other;
}

// "12 spaces left", "Full", "3 going · no limit": what a person wants to know
// before pressing Join.
export function describeSpaces(event) {
  if (event.status === "cancelled") return "Cancelled";
  if (event.capacity == null) return event.attendeeCount === 0 ? "Open to everyone" : `${event.attendeeCount} going · no limit`;
  if (event.spacesLeft === 0) return `Full · ${event.attendeeCount} going`;
  return `${event.spacesLeft} of ${event.capacity} ${event.spacesLeft === 1 ? "space" : "spaces"} left`;
}
