// Checks for "Navigate here" on an incident (Step 28):
//
//   npm run check:incident-nav
//
// Uses a made-up straight road on the equator (A - B - C, 0.002 degrees = 222.39 m per block)
// so every expected result is worked out by hand: another incident in the way, a resolved
// incident, an incident outside coverage, a destination inside its own danger zone, and a
// critical incident (the confirmation).
import { decodeGraph, encodeGraph } from "../lib/routing/format.js";
import { createRouter } from "../lib/routing/engine.js";
import { zonesFromIncidents } from "../lib/routing/zones.js";
import { incidentGuidance } from "../lib/nearest.js";
import {
  ACTIVE_INCIDENT_NOTE,
  fallbackMessage,
  incidentDestinationWarnings,
  incidentNeedsConfirmation,
  isActiveIncident,
  otherIncidents,
  routeFailureCode,
  routeWarnings,
} from "../lib/routing/navigation.js";
import { buildGraph } from "./routing/graphBuilder.mjs";
import { classifyWay } from "./routing/highwayRules.mjs";

const failures = [];
let count = 0;
const check = (name, actual, expected) => {
  count += 1;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
};
const near = (name, actual, expected, tolerance) => {
  count += 1;
  if (!(Math.abs(actual - expected) <= tolerance)) failures.push(`${name}\n    expected ${expected} +/- ${tolerance}\n    got      ${actual}`);
};

// A (0,0) -- B (0,0.002) -- C (0,0.004) -- D (0,0.006), one road.
const pos = { A: [0, 0], B: [0, 0.002], C: [0, 0.004], D: [0, 0.006] };
const keys = Object.keys(pos);
const lat = Float64Array.from(keys, (k) => pos[k][0]);
const lon = Float64Array.from(keys, (k) => pos[k][1]);
const ways = [{ nodes: [0, 1, 2, 3], ...classifyWay({ highway: "residential", name: "Main St" }) }];
const { graph } = buildGraph({ bbox: [-0.05, -0.05, 0.05, 0.05], lat, lon, ways });
const router = createRouter(decodeGraph(encodeGraph(graph)));

const incident = (id, over = {}) => ({ _id: id, type: "flood", severity: "high", status: "reported", location: { type: "Point", coordinates: [over.lon ?? 0, over.lat ?? 0] }, ...over });
const START = { lat: 0, lon: 0 };
// What useNavigation does for a trip to `dest`: zones from every other incident only.
const tripTo = (dest, all, to = { lat: dest.location.coordinates[1], lon: dest.location.coordinates[0] }) =>
  router.route({ from: START, to, profile: "walk", zones: zonesFromIncidents(otherIncidents(all, dest._id)) });

// ---- the confirmation ----
check("critical + reported: asks first", incidentNeedsConfirmation(incident("a", { severity: "critical" })), true);
check("high + in progress: asks first", incidentNeedsConfirmation(incident("a", { severity: "high", status: "in_progress" })), true);
check("medium + reported: no confirmation", incidentNeedsConfirmation(incident("a", { severity: "medium" })), false);
check("low + reported: no confirmation", incidentNeedsConfirmation(incident("a", { severity: "low" })), false);
check("critical + resolved: no confirmation", incidentNeedsConfirmation(incident("a", { severity: "critical", status: "resolved" })), false);
check("active means reported or in progress", [isActiveIncident({ status: "reported" }), isActiveIncident({ status: "in_progress" }), isActiveIncident({ status: "resolved" }), isActiveIncident(null)], [true, true, false, false]);

// ---- the warning in the panel ----
check("active incident: the safety warning", incidentDestinationWarnings(incident("a", { severity: "low" })), [
  { id: "active-incident", level: "warn", title: "This is an active incident", detail: ACTIVE_INCIDENT_NOTE },
]);
check("the warning text", ACTIVE_INCIDENT_NOTE, "This is an active incident. Keep a safe distance. If you are in danger, call 112.");
check("resolved incident: no warning", incidentDestinationWarnings(incident("a", { status: "resolved" })), []);

// ---- a destination inside its own zone ----
{
  const dest = incident("dest", { lon: 0.004, severity: "critical" }); // flood on the road at C
  check("its own zone exists when every incident counts", zonesFromIncidents([dest]).length, 1);
  const naive = router.route({ from: START, to: { lat: 0, lon: 0.004 }, profile: "walk", zones: zonesFromIncidents([dest]) });
  check("(before) counting its own zone: the route crosses it", naive.crossedZones.map((z) => z.id), ["dest"]);
  const trip = tripTo(dest, [dest]);
  check("destination in its own zone: the route is fine and crosses no zone", [trip.status, trip.crossedZones], ["ok", []]);
  const free = router.route({ from: START, to: { lat: 0, lon: 0.004 }, profile: "walk", zones: [] });
  near("... and its cost carries no penalty", trip.cost, free.cost, 1e-6);
  check("... and no 'passes an active incident' warning for the destination itself", routeWarnings({ route: trip, incidents: otherIncidents([dest], "dest"), shelter: null }), []);
  const withIt = routeWarnings({ route: trip, incidents: [dest], shelter: null }).map((w) => w.id);
  check("(before) counting it would warn about passing itself", withIt, ["incidents-near-route"]);
}

// ---- another incident in the way ----
{
  const dest = incident("dest", { lon: 0.006, severity: "high" });
  const inWay = incident("way", { lon: 0.002, type: "fire", severity: "critical" }); // on the road at B
  const trip = tripTo(dest, [dest, inWay]);
  check("another incident in the way: still a route (penalised, not blocked)", trip.status, "ok");
  check("... it says the route still crosses that zone, and not the destination's", trip.crossedZones.map((z) => z.id), ["way"]);
  const warnings = routeWarnings({ route: trip, incidents: otherIncidents([dest, inWay], "dest"), shelter: null });
  check("... with the no-safe-route and passes-incident warnings", warnings.map((w) => w.id), ["no-safe-route", "incidents-near-route"]);
  check("... the passes-incident warning names the other incident only", /fire \(critical\)/.test(warnings[1].detail) && !/flood/.test(warnings[1].detail), true);
  const all = [...incidentDestinationWarnings(dest), ...warnings].map((w) => w.id);
  check("... plus the active-incident warning first", all, ["active-incident", "no-safe-route", "incidents-near-route"]);
}

// ---- a resolved incident ----
{
  const dest = incident("dest", { lon: 0.004, status: "resolved", severity: "critical" });
  const trip = tripTo(dest, [dest]);
  check("resolved: a normal route", trip.status, "ok");
  check("resolved: no confirmation and no warning", [incidentNeedsConfirmation(dest), incidentDestinationWarnings(dest)], [false, []]);
  check("resolved: it never makes a zone anyway", zonesFromIncidents([dest]).length, 0);
}

// ---- the route stops at the nearest road, not at the incident ----
{
  const dest = incident("dest", { lon: 0.004, lat: 0.0009 }); // about 100 m north of the road
  const trip = tripTo(dest, [dest]);
  check("incident off the road: still routed", trip.status, "ok");
  near("... it is about 100 m from the road", trip.to.snapDistanceM, 100, 1);
  const end = trip.coordinates.at(-1);
  near("... the route ends on the road (latitude 0), not at the incident", end[1], 0, 1e-9);
  near("... below the incident's latitude", dest.location.coordinates[1] - end[1], 0.0009, 1e-9);
}

// ---- outside coverage ----
{
  const dest = incident("dest", { lon: 0.004, lat: 0.01 }); // about 1.1 km from any road
  const trip = tripTo(dest, [dest]);
  check("incident far from any road: outside coverage at the end", [trip.status, trip.where], ["outside-coverage", "end"]);
  check("... which becomes the incident fallback code", routeFailureCode(trip, "incident"), "outside-incident");
  check("... the shelter code stays as it was", routeFailureCode(trip, "shelter"), "outside-end");
  check("... a start outside coverage is the same for both", [routeFailureCode({ status: "outside-coverage", where: "start" }, "incident"), routeFailureCode({ status: "outside-coverage", where: "both" }, "incident")], ["outside-start", "outside-start"]);
  check("... other failures: no route", routeFailureCode({ status: "no-route" }, "incident"), "no-route");
  check("... the message names the 300 m limit", /300 m/.test(fallbackMessage("outside-incident")), true);
  const guide = incidentGuidance({ from: { lng: 0, lat: 0 }, source: "device", incident: dest });
  near("... the straight line is shown instead: 0.01 deg of latitude at lng 0.004 is about 1.2 km", guide.distanceKm, 1.18, 0.02);
  check("... in the direction of the incident (NNE rounds to N)", guide.direction, "N");
  const here = incidentGuidance({ from: { lng: 0.004, lat: 0.01 }, source: "saved", incident: dest });
  check("... and no direction when already there", [here.direction, here.source], [null, "saved"]);
}

// ---- otherIncidents ----
check("otherIncidents drops the destination (ids as text or ObjectId-like)", otherIncidents([{ _id: "a" }, { _id: "b" }, { _id: { toString: () => "a" } }], "a").map((i) => String(i._id)), ["b"]);
check("otherIncidents copes with no list", otherIncidents(null, "a"), []);

if (failures.length > 0) {
  console.error(`${failures.length} of ${count} checks FAILED:\n`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`All ${count} incident navigation checks passed.`);
