// Placeholder data for the Home dashboard. Shapes are what an API would return,
// so swapping in real data means replacing these imports with fetches.
// `icon` is a key into components/home/Icon.js; `tone` is red | green | amber | blue.

const ACTIVE_INCIDENTS = 12;

export const emergencyStatus = {
  active: true,
  incidentCount: ACTIVE_INCIDENTS,
  areaLabel: "your area",
};

export const quickActions = [
  { id: "report", title: "Report Incident", description: "Flag a hazard or emergency", href: "/report", icon: "file-plus", tone: "amber" },
  { id: "shelter", title: "Find Shelter", description: "Open shelters near you", href: "/shelters", icon: "house-plus", tone: "green" },
  { id: "route", title: "Safe Route", description: "Steer clear of blocked roads", href: "/map", icon: "route", tone: "green" },
  { id: "rescue", title: "Rescue Teams", description: "Contacts and live status", href: "/resources", icon: "life-buoy", tone: "blue" },
];

export const stats = [
  { id: "incidents", label: "Active Incidents", value: ACTIVE_INCIDENTS, detail: "Up 3 in 1h", trend: "up", icon: "triangle-alert", tone: "red" },
  { id: "teams", label: "Rescue Teams", value: 5, detail: "2 nearby", icon: "life-buoy", tone: "blue" },
  { id: "shelters", label: "Shelters Open", value: 8, detail: "3 within 5 km", icon: "house-plus", tone: "green" },
  { id: "helped", label: "People Helped", value: 124, detail: "Today", icon: "heart-handshake", tone: "amber" },
];

// x / y are percentages of the mini map's width / height.
export const mapMarkers = [
  { id: "m1", tone: "red", x: 28, y: 34 },
  { id: "m2", tone: "red", x: 62, y: 58 },
  { id: "m3", tone: "red", x: 44, y: 76 },
  { id: "m4", tone: "blue", x: 50, y: 38 },
  { id: "m5", tone: "green", x: 80, y: 26 },
  { id: "m6", tone: "green", x: 18, y: 66 },
  { id: "m7", tone: "amber", x: 74, y: 80 },
];

export const mapLegend = [
  { tone: "red", label: "Incident" },
  { tone: "blue", label: "Rescue team" },
  { tone: "green", label: "Shelter" },
  { tone: "amber", label: "Blocked road" },
];

export const nearby = [
  { id: "n1", name: "Central School Shelter", distanceKm: 1.2, action: "Directions", href: "/shelters", icon: "house-plus", tone: "green" },
  { id: "n2", name: "Rescue Team Alpha", distanceKm: 2.4, action: "Contact", href: "/resources", icon: "life-buoy", tone: "blue" },
  { id: "n3", name: "Flooding on River Road", distanceKm: 3.1, action: "Details", href: "/map", icon: "waves", tone: "red" },
];

// minutesAgo is relative to when the data was fetched, which keeps rendering deterministic.
export const activity = [
  { id: "a1", tone: "red", title: "Flood reported", detail: "River Road, Sector 4", minutesAgo: 4 },
  { id: "a2", tone: "amber", title: "Rescue team deployed", detail: "Team Alpha is heading to Sector 4", minutesAgo: 12 },
  { id: "a3", tone: "green", title: "Shelter opened", detail: "Central School, 120 spaces", minutesAgo: 35 },
  { id: "a4", tone: "blue", title: "Road blockage", detail: "Bridge Street closed, use Ring Road", minutesAgo: 62 },
];
