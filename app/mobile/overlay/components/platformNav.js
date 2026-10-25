// The Android app's extra navigation item. Replaces components/platformNav.js
// (which is empty) in the app build.
import { Settings } from "lucide-react";

export const PLATFORM_NAV_ITEMS = [{ href: "/settings", label: "Settings", icon: Settings, mobile: "top" }];
