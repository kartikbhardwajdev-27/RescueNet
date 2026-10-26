// Checks for the navigation logic (Step 25): turn-by-turn steps, following a route,
// warnings and wording.
//
//   npm run check:navigation
//
// Routes here are drawn on the equator, where 0.001 degrees is 111.195 m in every
// direction, so every bearing, turn and distance is worked out by hand.
import { circlePolygon, ESTIMATE_NOTE, fallbackMessage, formatDuration, incidentsAlongRoute, routeWarnings, routingCandidates, shelterProblem } from "../lib/routing/navigation.js";
import { buildSteps, compassName, maneuverFor, roadWord, turnAt } from "../lib/routing/instructions.js";
import {
  ARRIVED_M,
  initialRerouteState,
  locateOnRoute,
  nextRerouteState,
  OFF_ROUTE_M,
  progressOnRoute,
  REROUTE_COOLDOWN_MS,
  stepAt,
} from "../lib/routing/follow.js";
import { haversineM } from "../lib/routing/geometry.js";
import { navigateHref, parseNavigate } from "../lib/mapFocus.js";
import { guidanceFor } from "../lib/nearest.js";

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

const M = 111.195; // metres in 0.001 degree

// Builds a route from a start point and a list of legs: { name, bearing, metres, roadClass?, roundabout? }.
// Each leg is drawn as a straight line; coordinates are [lng, lat] and legs know where they sit.
function drawRoute(legSpecs) {
  const coordinates = [[0, 0]];
  const legs = [];
  for (const spec of legSpecs) {
    const [lng, lat] = coordinates[coordinates.length - 1];
    const radians = (spec.bearing * Math.PI) / 180;
    const degrees = spec.metres / (M * 1000);
    coordinates.push([lng + degrees * Math.sin(radians), lat + degrees * Math.cos(radians)]);
    legs.push({
      edge: legs.length,
      name: spec.name ?? "",
      roadClass: spec.roadClass ?? "residential",
      roundabout: spec.roundabout ?? false,
      distanceM: spec.metres,
      geometryStart: coordinates.length - 2,
      geometryEnd: coordinates.length - 1,
      inAvoidZone: false,
    });
  }
  return { coordinates, legs };
}
const stepsOf = (route, destinationName) => buildSteps(route, { destinationName }).map((s) => [s.maneuver, s.text]);

// ---- directions ----

near("a turn from north to east is 90 degrees right", turnAt(drawRoute([{ bearing: 0, metres: 200 }, { bearing: 90, metres: 200 }]).coordinates, 1), 90, 0.5);
near("a turn from north to west is 90 degrees left", turnAt(drawRoute([{ bearing: 0, metres: 200 }, { bearing: 270, metres: 200 }]).coordinates, 1), -90, 0.5);
check("turnAt at the ends is 0", [turnAt(drawRoute([{ bearing: 0, metres: 200 }]).coordinates, 0), turnAt(drawRoute([{ bearing: 0, metres: 200 }]).coordinates, 1)], [0, 0]);

for (const [turn, expected] of [
  [0, "straight"], [19.9, "straight"], [-19.9, "straight"], [20, "bear-right"], [-20, "bear-left"], [44.9, "bear-right"], [45, "right"], [-45, "left"],
  [90, "right"], [129.9, "right"], [130, "sharp-right"], [-130, "sharp-left"], [164.9, "sharp-right"], [165, "uturn"], [-180, "uturn"],
]) {
  check(`a turn of ${turn} degrees`, maneuverFor(turn), expected);
}
check("compass names", [0, 45, 90, 135, 180, 225, 270, 315, 360, -45].map(compassName), ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west", "north", "north-west"]);
check("unnamed road words", [roadWord("footway"), roadWord("steps"), roadWord("service"), roadWord("residential"), roadWord("primary"), roadWord("cycleway")], ["footpath", "steps", "service road", "road", "road", "cycle track"]);

{
  const route = drawRoute([
    { name: "North Rd", bearing: 0, metres: 222.39 },
    { name: "North Rd", bearing: 0, metres: 222.39 },
    { name: "East Rd", bearing: 90, metres: 222.39 },
    { name: "East Rd", bearing: 90, metres: 222.39 },
  ]);
  const steps = buildSteps(route, { destinationName: "Sector 22 Hall" });
  check("L-shaped route: three steps", steps.map((s) => [s.maneuver, s.text]), [
    ["depart", "Head north on North Rd"],
    ["right", "Turn right onto East Rd"],
    ["arrive", "You have arrived at Sector 22 Hall"],
  ]);
  near("L-shaped route: first step is the two legs added up", steps[0].distanceM, 444.78, 0.01);
  near("L-shaped route: second step too", steps[1].distanceM, 444.78, 0.01);
  check("L-shaped route: where each step starts and ends in the line", steps.map((s) => [s.startIndex, s.endIndex]), [[0, 2], [2, 4], [4, 4]]);
  near("L-shaped route: the turn is recorded", steps[1].turn, 90, 0.5);
  check("L-shaped route: the arrive step has no distance", steps[2].distanceM, 0);
}
check("left turn", stepsOf(drawRoute([{ name: "A", bearing: 0, metres: 200 }, { name: "B", bearing: 270, metres: 200 }]), "X")[1], ["left", "Turn left onto B"]);
check("bear right (30 degrees)", stepsOf(drawRoute([{ name: "A", bearing: 0, metres: 200 }, { name: "B", bearing: 30, metres: 200 }]), "X")[1], ["bear-right", "Bear right onto B"]);
check("bear left (-30 degrees)", stepsOf(drawRoute([{ name: "A", bearing: 0, metres: 200 }, { name: "B", bearing: 330, metres: 200 }]), "X")[1], ["bear-left", "Bear left onto B"]);
check("sharp left (-150 degrees)", stepsOf(drawRoute([{ name: "A", bearing: 0, metres: 200 }, { name: "B", bearing: 210, metres: 200 }]), "X")[1], ["sharp-left", "Turn sharp left onto B"]);
check("u-turn", stepsOf(drawRoute([{ name: "A", bearing: 0, metres: 200 }, { name: "B", bearing: 180, metres: 200 }]), "X")[1], ["uturn", "Make a U-turn onto B"]);
check("straight on but the name changes", stepsOf(drawRoute([{ name: "A", bearing: 0, metres: 200 }, { name: "B", bearing: 0, metres: 200 }]), "X")[1], ["straight", "Continue onto B"]);
check("same name, straight on: one step", stepsOf(drawRoute([{ name: "A", bearing: 0, metres: 200 }, { name: "A", bearing: 5, metres: 200 }]), "X").length, 2);
check("same name round a gentle bend (30 degrees): still one step", stepsOf(drawRoute([{ name: "A", bearing: 0, metres: 200 }, { name: "A", bearing: 30, metres: 200 }]), "X").length, 2);
check("same name round a corner (90 degrees): a turn", stepsOf(drawRoute([{ name: "A", bearing: 0, metres: 200 }, { name: "A", bearing: 90, metres: 200 }]), "X")[1], ["right", "Turn right onto A"]);
check("a name that appears part way along a straight road: one step", stepsOf(drawRoute([{ name: "A", bearing: 0, metres: 200 }, { name: "", bearing: 0, metres: 200 }, { name: "A", bearing: 0, metres: 200 }]), "X").length, 2);
check("unnamed roads are called what they are", stepsOf(drawRoute([{ bearing: 90, metres: 200 }, { bearing: 0, metres: 200, roadClass: "footway" }, { bearing: 270, metres: 200, roadClass: "steps" }]), "the shelter"), [
  ["depart", "Head east along the road"],
  ["left", "Turn left onto the footpath"],
  ["left", "Turn left onto the steps"],
  ["arrive", "You have arrived at the shelter"],
]);
check("unnamed, straight on, same kind: one step", stepsOf(drawRoute([{ bearing: 0, metres: 200 }, { bearing: 3, metres: 200 }, { bearing: 0, metres: 200 }]), "X").length, 2);
check("unnamed, a corner: a turn", stepsOf(drawRoute([{ bearing: 0, metres: 200 }, { bearing: 90, metres: 200 }]), "X")[1], ["right", "Turn right onto the road"]);
check("unnamed, straight on but the kind of road changes: a step", stepsOf(drawRoute([{ bearing: 0, metres: 200 }, { bearing: 0, metres: 200, roadClass: "footway" }]), "X")[1], ["straight", "Continue onto the footpath"]);
{
  // A 3 m kink must not be read as a turn: north, a 3 m step sideways, north again, one road name.
  const route = drawRoute([{ name: "A", bearing: 0, metres: 100 }, { name: "A", bearing: 90, metres: 3 }, { name: "A", bearing: 0, metres: 100 }]);
  check("a 3 m jog in one named road is not a turn", buildSteps(route, { destinationName: "X" }).length, 2);
  const unnamed = drawRoute([{ bearing: 0, metres: 100 }, { bearing: 90, metres: 3 }, { bearing: 0, metres: 100 }]);
  check("... nor in an unnamed road", buildSteps(unnamed, { destinationName: "X" }).length, 2);
}
{
  const route = drawRoute([
    { name: "Approach Rd", bearing: 0, metres: 150 },
    { name: "Ring Rd", bearing: 20, metres: 30, roundabout: true },
    { name: "Ring Rd", bearing: 100, metres: 30, roundabout: true },
    { name: "Exit Rd", bearing: 90, metres: 200 },
  ]);
  check("roundabout: enter, then exit onto the road", stepsOf(route, "X"), [
    ["depart", "Head north on Approach Rd"],
    ["roundabout", "Enter the roundabout"],
    ["roundabout-exit", "Exit the roundabout onto Exit Rd"],
    ["arrive", "You have arrived at X"],
  ]);
}
check("one leg: head off, arrive", stepsOf(drawRoute([{ name: "A", bearing: 180, metres: 80 }]), "Town Hall"), [["depart", "Head south on A"], ["arrive", "You have arrived at Town Hall"]]);
check("no legs: you are there", buildSteps({ coordinates: [[0, 0]], legs: [] }, { destinationName: "X" }).map((s) => s.text), ["You are at X"]);
check("steps are numbered in order", buildSteps(drawRoute([{ name: "A", bearing: 0, metres: 100 }, { name: "B", bearing: 90, metres: 100 }]), {}).map((s) => s.index), [0, 1, 2]);
check("destination name defaults", buildSteps(drawRoute([{ name: "A", bearing: 0, metres: 100 }]), {}).at(-1).text, "You have arrived at your destination");

// ---- following a route ----

{
  // 1 km due north in 5 points of 250 m.
  const north = { coordinates: [0, 1, 2, 3, 4].map((i) => [0, (i * 0.25) / (M)]) , legs: [] };
  north.coordinates = [0, 1, 2, 3, 4].map((i) => [0, (i * 250) / (M * 1000)]);
  const at = (metres, eastMetres = 0) => ({ lat: metres / (M * 1000), lon: eastMetres / (M * 1000) });

  const middle = locateOnRoute(north, at(500));
  near("on the route at 500 m: along", middle.alongM, 500, 0.5);
  near("on the route at 500 m: remaining", middle.remainingM, 500, 0.5);
  near("on the route at 500 m: total", middle.totalM, 1000, 0.5);
  near("on the route at 500 m: distance from the route", middle.distanceM, 0, 0.01);
  check("on the route at 500 m: which stretch", middle.segment, 1);

  near("40 m to the side: distance", locateOnRoute(north, at(300, 40)).distanceM, 40, 0.1);
  near("40 m to the side: along is unchanged", locateOnRoute(north, at(300, 40)).alongM, 300, 0.5);
  near("before the start: along 0, distance to the start", locateOnRoute(north, at(-30)).alongM, 0, 0.001);
  near("before the start: distance", locateOnRoute(north, at(-30)).distanceM, 30, 0.1);
  near("past the end: remaining 0", locateOnRoute(north, at(1100)).remainingM, 0, 0.001);

  check("40 m off the route is on it", progressOnRoute(north, [], at(300, 40)).offRoute, false);
  check("59 m off the route is on it", progressOnRoute(north, [], at(300, 59)).offRoute, false);
  check("61 m off the route is off it", progressOnRoute(north, [], at(300, 61)).offRoute, true);
  check("the limit is 60 m", OFF_ROUTE_M, 60);

  const steps = [{ startIndex: 0 }, { startIndex: 2 }, { startIndex: 4 }];
  check("step lookup, first stretch", [stepAt(steps, 0), stepAt(steps, 1)], [0, 0]);
  check("step lookup, second stretch", [stepAt(steps, 2), stepAt(steps, 3)], [1, 1]);
  check("step lookup, arrived", stepAt(steps, 3, true), 2);
  check("progress picks the step", [progressOnRoute(north, steps, at(100)).stepIndex, progressOnRoute(north, steps, at(700)).stepIndex], [0, 1]);

  check("at the end: arrived", progressOnRoute(north, steps, at(990)).arrived, true);
  check("and its step is the last", progressOnRoute(north, steps, at(990)).stepIndex, 2);
  check("30 m short: not arrived", progressOnRoute(north, steps, at(960)).arrived, false);
  check("the end of the road, but 100 m away from it: not arrived", progressOnRoute(north, steps, at(1000, 100)).arrived, false);
  check("arrived means within 25 m", ARRIVED_M, 25);
  check("a poor fix (150 m accuracy) is not used to judge being off the route", progressOnRoute(north, steps, { ...at(300, 90), accuracy: 150 }).usable, false);
  check("a fix with 20 m accuracy is", progressOnRoute(north, steps, { ...at(300, 90), accuracy: 20 }).usable, true);
  check("a fix with no accuracy is", progressOnRoute(north, steps, at(300, 90)).usable, true);
  check("the snapped point lies on the route", [locateOnRoute(north, at(300, 40)).snapped.lon, locateOnRoute(north, at(300, 40)).snapped.lat > 0], [0, true]);

  // A route that doubles back on itself: 600 m north, 20 m east, 600 m south. A point
  // between the two legs is 10 m from each; which one it belongs to depends on where
  // the person was.
  const uShape = { coordinates: [[0, 0], [0, 600 / (M * 1000)], [20 / (M * 1000), 600 / (M * 1000)], [20 / (M * 1000), 0]], legs: [] };
  const between = { lat: 300 / (M * 1000), lon: 10 / (M * 1000) };
  near("doubling back: last seen on the way out, so it is on the way out", locateOnRoute(uShape, between, 0).alongM, 300, 1);
  near("doubling back: last seen on the way back, so it is on the way back", locateOnRoute(uShape, between, 2).alongM, 600 + 20 + 300, 1);
  near("doubling back: with nothing known, the first of the two", locateOnRoute(uShape, between).alongM, 300, 1);
  // Teleporting far away: the hint is dropped.
  near("a hint far from the real position is ignored", locateOnRoute(north, at(900), 0).alongM, 900, 0.5);
  check("a route of one point", locateOnRoute({ coordinates: [[0, 0]], legs: [] }, at(50)).segment, 0);
}

// Deciding when to recalculate.
{
  let state = initialRerouteState();
  const feed = (input) => {
    const out = nextRerouteState(state, input);
    state = out.state;
    return out.reroute;
  };
  check("one fix off the route: wait", feed({ offRoute: true, now: 1000 }), false);
  check("a second fix off the route: recalculate", feed({ offRoute: true, now: 2000 }), true);
  check("still off right after: cooldown, wait", [feed({ offRoute: true, now: 3000 }), feed({ offRoute: true, now: 4000 })], [false, false]);
  check("off for a long time: recalculate again once the cooldown has passed", feed({ offRoute: true, now: 2000 + REROUTE_COOLDOWN_MS }), true);
  check("back on the route resets the count", [feed({ offRoute: true, now: 20_000 }), feed({ offRoute: false, now: 21_000 }), feed({ offRoute: true, now: 40_000 })], [false, false, false]);
  check("a fix too inaccurate to judge changes nothing", [feed({ offRoute: true, usable: false, now: 50_000 }), feed({ offRoute: true, usable: false, now: 51_000 })], [false, false]);
  check("... so the next good off-route fix is only the second in a row", feed({ offRoute: true, now: 60_000 }), true);
  check("cooldown", REROUTE_COOLDOWN_MS, 8000);
}

// ---- who can be navigated to ----

{
  const shelter = (id, status, capacity, occupied, lng = 76.78, lat = 30.73) => ({ _id: id, name: id, status, capacity, occupied, location: { type: "Point", coordinates: [lng, lat] } });
  const list = [shelter("a", "open", 100, 40), shelter("b", "open", 100, 100), shelter("c", "full", 100, 100), shelter("d", "closed", 100, 0), shelter("e", "open", 50, 49, 76.9, 30.8)];
  check("candidates: open shelters with a free space, as { id, lat, lon }", routingCandidates(list), [
    { id: "a", lat: 30.73, lon: 76.78 },
    { id: "e", lat: 30.8, lon: 76.9 },
  ]);
  check("candidates from nothing", [routingCandidates(null), routingCandidates([])], [[], []]);
  check("shelter problems", [shelterProblem(list[0]), shelterProblem(list[1]), shelterProblem(list[2]), shelterProblem(list[3]), shelterProblem(null)], [null, "full", "full", "closed", null]);
}

// ---- incidents along a route and warnings ----

{
  const north = { coordinates: [0, 1, 2, 3, 4].map((i) => [0, (i * 250) / (M * 1000)]), legs: [] };
  const incident = (id, type, severity, metresNorth, metresEast, status = "reported") => ({
    _id: id, type, severity, status, location: { type: "Point", coordinates: [metresEast / (M * 1000), metresNorth / (M * 1000)] },
  });
  const found = incidentsAlongRoute(north, [
    incident("late", "fire", "critical", 800, 40),
    incident("early", "flood", "high", 200, 100),
    incident("far", "flood", "high", 500, 200),
    incident("done", "flood", "high", 500, 20, "resolved"),
    incident("beyond", "fire", "high", 1500, 0),
    incident("medical", "medical", "low", 600, 140),
    { _id: "broken", type: "fire", severity: "high", status: "reported" },
  ]);
  check("incidents within 150 m, in the order they are passed", found.map((f) => f.incident._id), ["early", "medical", "late"]);
  near("... how far from the route", found[0].distanceM, 100, 0.2);
  near("... how far along", found[0].alongM, 200, 0.5);
  check("a route of one point has nothing along it", incidentsAlongRoute({ coordinates: [[0, 0]] }, [incident("x", "fire", "high", 0, 0)]), []);

  const clean = { ...north, crossedZones: [] };
  check("nothing to say about a clear route", routeWarnings({ route: clean, incidents: [], shelter: null }), []);
  const withIncident = routeWarnings({ route: clean, incidents: [incident("early", "flood", "high", 200, 100)], shelter: null });
  check("a route that passes an incident says so", withIncident.map((w) => [w.id, w.level, w.title]), [["incidents-near-route", "warn", "Passes an active incident"]]);
  check("... naming it", withIncident[0].detail, "flood (high), 100 m from the route.");
  const many = routeWarnings({ route: clean, incidents: [incident("a", "flood", "high", 100, 0), incident("b", "fire", "high", 300, 0), incident("c", "fire", "low", 500, 0), incident("d", "other", "low", 700, 0)], shelter: null });
  check("... several: counted, three named, the rest counted", [many[0].title, many[0].detail.endsWith("; and 1 more.")], ["Passes 4 active incidents", true]);
  const crossing = routeWarnings({
    route: { ...north, crossedZones: [{ id: "z", type: "flood", severity: "high" }, { id: "y", type: "fire", severity: "critical" }] },
    incidents: [],
    shelter: null,
  });
  check("a route through an avoid zone: no safe route found", crossing.map((w) => w.id), ["no-safe-route"]);
  check("... which says what it is, and does not call anything safe", [crossing[0].title, /flood, fire/.test(crossing[0].detail), /call 112/.test(crossing[0].detail), /\bis safe\b/.test(crossing[0].detail)], ["No route that avoids reported danger was found", true, true, false]);
  const full = routeWarnings({ route: clean, incidents: [], shelter: { status: "full", occupied: 10, capacity: 10 } });
  check("a full shelter is flagged", full.map((w) => [w.id, w.title]), [["shelter-unavailable", "This shelter is full right now"]]);
  check("a closed shelter is flagged", routeWarnings({ route: clean, incidents: [], shelter: { status: "closed", occupied: 0, capacity: 10 } })[0].title, "This shelter is closed right now");
}

// ---- wording ----

check("durations", [0, 29, 31, 599, 600, 3599, 3600, 3900, 7260, 20_000].map(formatDuration), ["≈ 1 min", "≈ 1 min", "≈ 1 min", "≈ 10 min", "≈ 10 min", "≈ 1 h", "≈ 1 h", "≈ 1 h 5 min", "≈ 2 h 1 min", "≈ 5 h 33 min"]);
check("every duration is marked as approximate", formatDuration(1234).startsWith("≈"), true);
check("the estimate note says it is not live traffic", /not live traffic/.test(ESTIMATE_NOTE), true);
check("fallback messages", ["graph-missing", "graph-corrupt", "outside-start", "outside-end", "no-route", "failed", "anything"].map((c) => fallbackMessage(c).length > 20), [true, true, true, true, true, true, true]);
check("fallback: outside coverage names the 300 m limit", [/300 m/.test(fallbackMessage("outside-start")), /300 m/.test(fallbackMessage("outside-end"))], [true, true]);
{
  const ring = circlePolygon(30.73, 76.78, 200);
  check("a zone ring has 48 points and closes", [ring.length, JSON.stringify(ring[0]) === JSON.stringify(ring.at(-1))], [49, true]);
  const radii = ring.map(([lng, lat]) => haversineM(30.73, 76.78, lat, lng));
  near("every point is 200 m from the centre (nearest)", Math.min(...radii), 200, 1);
  near("every point is 200 m from the centre (furthest)", Math.max(...radii), 200, 1);
}
check("navigate links", [navigateHref("abc123"), parseNavigate("shelter:abc123"), parseNavigate("shelter:"), parseNavigate("incident:abc"), parseNavigate(null), parseNavigate("shelter:a b")], [
  "/map?navigate=shelter:abc123",
  { id: "abc123", raw: "shelter:abc123" },
  null,
  null,
  null,
  null,
]);

// ---- straight-line guidance to one chosen shelter (the fallback) ----

{
  const shelter = { _id: "s1", name: "Hall", status: "open", capacity: 10, occupied: 1, location: { type: "Point", coordinates: [0.01, 0] } };
  const g = guidanceFor({ from: { lng: 0, lat: 0 }, source: "device", shelter, incidents: [] });
  near("guidanceFor: 0.01 degrees east on the equator is 1.112 km", g.distanceKm, 1.112, 0.005);
  check("guidanceFor: east", [g.direction, Math.round(g.bearing)], ["E", 90]);
  check("guidanceFor: the line, the target, no warning", [g.line, g.target, g.warning, g.source], [[[0, 0], [0.01, 0]], { lng: 0.01, lat: 0 }, null, "device"]);
  const here = guidanceFor({ from: { lng: 0.01, lat: 0 }, source: "saved", shelter, incidents: [] });
  check("guidanceFor: already at the shelter, no direction", [here.direction, here.source], [null, "saved"]);
  const incident = { _id: "i", type: "flood", severity: "high", status: "reported", location: { type: "Point", coordinates: [0.011, 0] } };
  check("guidanceFor: warns about a high incident within 2 km of the shelter", guidanceFor({ from: { lng: 0, lat: 0 }, source: "device", shelter, incidents: [incident] }).warning.count, 1);
  check("guidanceFor: the shelter does not have to have room (the person chose it)", guidanceFor({ from: { lng: 0, lat: 0 }, source: "device", shelter: { ...shelter, status: "full" }, incidents: [] }).shelter.status, "full");
}

if (failures.length > 0) {
  console.error(`${failures.length} of ${count} checks FAILED:\n`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`All ${count} navigation checks passed.`);
