import { BookOpen, CalendarDays, FilePlus, House, HousePlus, Info, Map as MapIcon } from "lucide-react";
import { PLATFORM_NAV_ITEMS } from "./platformNav";

// `mobile` decides where the item lives under 768px: "tab" = bottom tab bar,
// "top" = icon button in the top bar. `shortLabel` is for tight tab labels.
export const NAV_ITEMS = [
  { href: "/", label: "Home", icon: House, mobile: "tab" },
  { href: "/map", label: "Map", icon: MapIcon, mobile: "tab" },
  { href: "/report", label: "Report Incident", shortLabel: "Report", icon: FilePlus, mobile: "tab" },
  { href: "/shelters", label: "Shelters", icon: HousePlus, mobile: "tab" },
  // The bottom bar has no room (four tabs and the SOS button), so on a phone
  // Events lives in the "More" menu next to Resources and About.
  { href: "/events", label: "Events", icon: CalendarDays, mobile: "top" },
  { href: "/resources", label: "Resources", icon: BookOpen, mobile: "top" },
  { href: "/about", label: "About", icon: Info, mobile: "top" },
  ...PLATFORM_NAV_ITEMS,
];

export function isActive(pathname, href) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
