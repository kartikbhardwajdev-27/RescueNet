// Which OpenStreetMap ways become roads in the graph, and how. Pure functions on a
// way's tags, so the rules can be read and tested on their own
// (npm run check:routing).
//
// The rules are deliberately simple and conservative. They are an approximation of
// how a person on foot or in a car can use a road, built only from OSM tags:
//   - Cars: motorway, trunk, primary, secondary, tertiary, unclassified, residential,
//     living_street, service and road, plus their _link ramps. Not tracks, paths,
//     footways, steps, cycleways or pedestrian streets.
//   - Walking: everything a car can use except motorways and expressways
//     (motorway, motorway_link, motorroad=yes), plus footway, pedestrian, path,
//     steps, track and cycleway.
//   - Both: anything tagged as closed to that mode (access, motor_vehicle, vehicle,
//     foot = no / private ...) is left out of that mode.
//   - Parking aisles and drive-throughs are dropped altogether; they add many tiny
//     edges and are never a route.
// Turn restrictions, tolls, barriers (gates, bollards), width and surface are NOT
// read. See docs/NAVIGATION.md for what that means.

import { CLASS_CODE, FLAG_DRIVE, FLAG_ROUNDABOUT, FLAG_WALK } from "../../lib/routing/format.js";

const BASE_CLASS = {
  motorway: "motorway",
  motorway_link: "motorway",
  trunk: "trunk",
  trunk_link: "trunk",
  primary: "primary",
  primary_link: "primary",
  secondary: "secondary",
  secondary_link: "secondary",
  tertiary: "tertiary",
  tertiary_link: "tertiary",
  unclassified: "unclassified",
  road: "unclassified",
  residential: "residential",
  living_street: "living_street",
  service: "service",
  track: "track",
  path: "path",
  footway: "footway",
  steps: "steps",
  cycleway: "cycleway",
  pedestrian: "pedestrian",
};

// Cars can use these.
const DRIVE_CLASSES = new Set([
  "motorway",
  "trunk",
  "primary",
  "secondary",
  "tertiary",
  "unclassified",
  "residential",
  "living_street",
  "service",
]);
// People on foot can use these, unless something below says otherwise.
const WALK_CLASSES = new Set([
  "trunk",
  "primary",
  "secondary",
  "tertiary",
  "unclassified",
  "residential",
  "living_street",
  "service",
  "track",
  "path",
  "footway",
  "steps",
  "cycleway",
  "pedestrian",
]);

// Tag values that mean "not for you".
const CLOSED = new Set(["no", "private", "customers", "delivery", "agricultural", "forestry", "military", "permit"]);
const YES_ONEWAY = new Set(["yes", "true", "1"]);
const REVERSE_ONEWAY = new Set(["-1", "reverse"]);
const NO_ONEWAY = new Set(["no", "false", "0"]);

// Is the way open to a mode? `keys` go from the most specific tag to the most general; the
// first one present decides.
function open(tags, keys) {
  for (const key of keys) {
    if (tags[key] !== undefined) return !CLOSED.has(tags[key]);
  }
  return true;
}

// The way's direction rule: 1 = only from its first node to its last, -1 = only the
// other way, 0 = both ways.
export function onewayDirection(tags) {
  const value = tags.oneway;
  if (YES_ONEWAY.has(value)) return 1;
  if (REVERSE_ONEWAY.has(value)) return -1;
  if (NO_ONEWAY.has(value)) return 0;
  // Not stated: roundabouts and motorways are one-way by definition.
  if (tags.junction === "roundabout" || tags.junction === "circular") return 1;
  if (tags.highway === "motorway" || tags.highway === "motorway_link") return 1;
  return 0;
}

// The name a person would read on a sign: the English name when there is one, then the
// local name, then the road number ("NH 5"). Empty when the road has none.
export function streetName(tags) {
  return (tags["name:en"] || tags.name || tags.ref || "").trim();
}

// Returns null for a way that is not a road (or not one we route on), otherwise
//   { cls, flags, oneway, name }
// cls is a CLASS_CODE number, flags is FLAG_WALK / FLAG_DRIVE / FLAG_ROUNDABOUT bits
// (FLAG_ONEWAY is set later, once the way's direction has been normalised), oneway is
// 1, -1 or 0 as in onewayDirection (0 for roads cars cannot use: it means nothing to
// someone walking), name is the street name.
export function classifyWay(tags) {
  const baseName = BASE_CLASS[tags.highway];
  if (!baseName) return null; // construction, proposed, bridleway, platform, ...
  if (tags.area === "yes") return null; // a plaza or car park outline, not a line to follow
  if (tags.highway === "service" && (tags.service === "parking_aisle" || tags.service === "drive-through")) return null;

  const drive = DRIVE_CLASSES.has(baseName) && open(tags, ["motor_vehicle", "vehicle", "access"]);
  let walk = WALK_CLASSES.has(baseName) && open(tags, ["foot", "access"]);
  if (tags.motorroad === "yes") walk = false; // expressways: no pedestrians
  if (!drive && !walk) return null;
  if (baseName === "motorway") walk = false;

  let flags = 0;
  if (walk) flags |= FLAG_WALK;
  if (drive) flags |= FLAG_DRIVE;
  if (tags.junction === "roundabout") flags |= FLAG_ROUNDABOUT;
  // One-way matters for cars only.
  const oneway = drive ? onewayDirection(tags) : 0;
  return { cls: CLASS_CODE[baseName], flags, oneway, name: streetName(tags) };
}
