import { BookOpen, FilePlus, House, HousePlus, Info, Map as MapIcon } from "lucide-react";

// `mobile` decides where the item lives under 768px: "tab" = bottom tab bar,
// "top" = icon button in the top bar. `shortLabel` is for tight tab labels.
export const NAV_ITEMS = [
  { href: "/", label: "Home", icon: House, mobile: "tab" },
  { href: "/map", label: "Map", icon: MapIcon, mobile: "tab" },
  { href: "/report", label: "Report Incident", shortLabel: "Report", icon: FilePlus, mobile: "tab" },
  { href: "/shelters", label: "Shelters", icon: HousePlus, mobile: "tab" },
  { href: "/resources", label: "Resources", icon: BookOpen, mobile: "top" },
  { href: "/about", label: "About", icon: Info, mobile: "top" },
];

export function isActive(pathname, href) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
