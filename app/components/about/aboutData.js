import pkg from "@/package.json";

// What the About page says. Versions are read from package.json so they cannot
// drift from what is actually installed.
const version = (name) => String(pkg.dependencies?.[name] ?? pkg.devDependencies?.[name] ?? "").replace(/^[\^~]/, "");

export const HOW_IT_WORKS = [
  {
    title: "Everything runs on one laptop",
    body: "RescueNet's server and database run on a laptop. Phones and other laptops open it over the same WiFi or the laptop's hotspot. Nothing needs the internet, so it keeps working when the internet or the phone network does not.",
  },
  {
    title: "The map is a file, not a service",
    body: "The street map is drawn from a single map file stored on the laptop and covers Chandigarh, Mohali and Panchkula. No map server, font host or analytics is contacted while the app runs.",
  },
  {
    title: "Road directions are worked out on your device",
    body: "Directions to a shelter use a small file of OpenStreetMap roads that is saved on your device. The route is calculated on your phone or laptop, with no internet, and avoids roads near reported floods, fires and earthquakes when it can. It is an estimate, with no live traffic.",
  },
  {
    title: "Reports are saved first, then sent",
    body: "A report or an SOS is saved on your device before it is sent. If the server cannot be reached it stays saved and is sent automatically when the connection returns, while RescueNet is open. SOS goes first, and nothing is sent twice.",
  },
  {
    title: "Pages are kept on your device",
    body: "On the laptop itself (and on phones that allow it) the app's pages are saved by the browser, so they still open when the server is down. This does not work over plain http on a phone, because browsers only allow it on a secure connection.",
  },
];

export const WHO_CAN_DO_WHAT = [
  { who: "Anyone", does: "Report an incident or send an SOS (no account needed), see the map, shelters, events and resources." },
  { who: "Citizens", does: "Everything above, plus a list of their own reports and the events they have joined." },
  { who: "Organizations", does: "Add shelters and keep the ones they added up to date, set an incident to in progress or resolved, and post events that citizens join." },
];

export const TECH_STACK = [
  { name: "Next.js", detail: `App Router, version ${version("next")}` },
  { name: "React", detail: `version ${version("react")}` },
  { name: "Tailwind CSS", detail: `version ${version("tailwindcss")}` },
  { name: "MongoDB with Mongoose", detail: `Mongoose ${version("mongoose")}, GeoJSON points with geospatial indexes` },
  { name: "MapLibre GL", detail: `version ${version("maplibre-gl")}, with PMTiles ${version("pmtiles")} and Protomaps basemaps ${version("@protomaps/basemaps")} reading a local map file` },
  { name: "Offline layer", detail: "A hand-written service worker and an IndexedDB outbox, no packages" },
  { name: "Accounts", detail: "Passwords hashed with bcrypt, a signed login cookie (JWT)" },
  { name: "Icons and fonts", detail: "lucide-react, Space Grotesk and Inter, all bundled with the app" },
];

export const KNOWN_LIMITS = [
  "Road directions are an estimate from OpenStreetMap roads. They use no live traffic, know nothing about turn restrictions, may miss one-way streets, and know about closures only from incidents reported on RescueNet. If the road data is missing, or you are outside the mapped area, you get a straight line instead.",
  "The map covers Chandigarh, Mohali and Panchkula only. Elsewhere the basemap is blank, though incidents and shelters still appear.",
  "\"Suggested priority\" is a short list of keyword rules, not a judgement. It can miss danger that is described in other words, and people still decide.",
  "Only reports and SOS are queued for later. Joining an event, changing a status or editing a shelter needs the server at that moment.",
  "Queued items are sent only while RescueNet is open in a browser. There is no background sending.",
  "Over plain http on a phone, browsers refuse location and the saved-pages feature, so an SOS from a phone needs a location saved on the account.",
  "Shelter capacity and incident details are whatever people entered. Nobody checks them.",
];

export const CREDITS = [
  "Map data © OpenStreetMap contributors, available under the Open Database License.",
  "Road data for route guidance © OpenStreetMap contributors (Open Database License), taken from a Geofabrik extract once and stored in the app. It is not downloaded while the app runs.",
  "Basemap design and map file tooling by Protomaps.",
  "Fonts: Space Grotesk and Inter (bundled), Noto Sans for the map labels. All are open-licence fonts.",
];
