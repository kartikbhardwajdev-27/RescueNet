// Checks for lib/nearest.js: the distance, compass direction, nearest-shelter and
// "near an active incident" rules behind "Nearest shelter".
//
//   npm run check:nearest
//
// The expected numbers come from published or hand-worked values, not from the
// code under test: London to Paris is about 343.5 km at a bearing of 148 degrees,
// and one degree along the equator is 111.19 km.
import { distanceKm, formatDistance } from "../lib/geo.js";
import {
  NEAR_INCIDENT_KM,
  bearingDegrees,
  buildGuidance,
  compassDirection,
  compassWord,
  dangerousIncidentsNear,
  findNearestShelter,
  resolveStartPoint,
  shelterHasRoom,
  shelterWarnings,
} from "../lib/nearest.js";

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
const P = (lng, lat) => ({ lng, lat });

// ---- distance (haversine) ----
near("1 degree of longitude on the equator", distanceKm(P(0, 0), P(1, 0)), 111.195, 0.01);
near("1 degree of latitude", distanceKm(P(10, 20), P(10, 21)), 111.195, 0.01);
near("London to Paris", distanceKm(P(-0.1278, 51.5074), P(2.3522, 48.8566)), 343.5, 1);
near("Chandigarh Sector 17 to Delhi Connaught Place", distanceKm(P(76.7827, 30.7398), P(77.2167, 28.6315)), 238, 2);
near("same point", distanceKm(P(76.78, 30.73), P(76.78, 30.73)), 0, 1e-9);
near("symmetry", distanceKm(P(1, 2), P(30, 40)), distanceKm(P(30, 40), P(1, 2)), 1e-9);
near("across the date line", distanceKm(P(179.5, 0), P(-179.5, 0)), 111.195, 0.01);

// ---- how a distance is written ----
for (const [km, text] of [[0.004, "10 m"], [0.85, "850 m"], [0.994, "990 m"], [0.9951, "1.0 km"], [0.9999, "1.0 km"], [1, "1.0 km"], [1.24, "1.2 km"], [7.327, "7.3 km"], [9.94, "9.9 km"], [9.96, "10 km"], [14.4, "14 km"], [238.15, "238 km"]]) {
  check(`${km} km is written ${text}`, formatDistance(km), text);
}

// ---- bearing ----
near("due north", bearingDegrees(P(0, 0), P(0, 1)), 0, 1e-6);
near("due east", bearingDegrees(P(0, 0), P(1, 0)), 90, 1e-6);
near("due south", bearingDegrees(P(0, 0), P(0, -1)), 180, 1e-6);
near("due west", bearingDegrees(P(0, 0), P(-1, 0)), 270, 1e-6);
near("1 degree north-east of the equator (hand worked: atan(cos 1 degree))", bearingDegrees(P(0, 0), P(1, 1)), (Math.atan(Math.cos(Math.PI / 180)) * 180) / Math.PI, 1e-9);
near("1 degree south-west of the equator", bearingDegrees(P(0, 0), P(-1, -1)), 180 + (Math.atan(Math.cos(Math.PI / 180)) * 180) / Math.PI, 1e-9);
near("10 degrees east along 60N bends north of east (hand worked)", bearingDegrees(P(0, 60), P(10, 60)), 85.667, 0.01);
near("London to Paris", bearingDegrees(P(-0.1278, 51.5074), P(2.3522, 48.8566)), 148.1, 0.2);
near("Chandigarh to Delhi (just east of south)", bearingDegrees(P(76.7827, 30.7398), P(77.2167, 28.6315)), 169.75, 0.1);
near("Mohali Phase 7 to Chandigarh Sector 22", bearingDegrees(P(76.7179, 30.7046), P(76.7794, 30.7333)), 61.49, 0.1);
near("always 0 to 360", bearingDegrees(P(0, 0), P(-0.0001, 1)) >= 0 && bearingDegrees(P(0, 0), P(-0.0001, 1)) < 360 ? 1 : 0, 1, 0);

// ---- compass ----
for (const [deg, dir] of [[0, "N"], [22.4, "N"], [22.5, "NE"], [45, "NE"], [67.4, "NE"], [67.5, "E"], [90, "E"], [135, "SE"], [180, "S"], [225, "SW"], [270, "W"], [315, "NW"], [337.4, "NW"], [337.5, "N"], [359.9, "N"], [360, "N"], [-45, "NW"], [405, "NE"]]) {
  check(`${deg} degrees is ${dir}`, compassDirection(deg), dir);
}
check("compass words", [compassWord("N"), compassWord("SW"), compassWord("NE")], ["north", "south-west", "north-east"]);

// ---- which shelters count ----
const shelter = (id, lng, lat, over = {}) => ({ _id: id, name: id, status: "open", capacity: 100, occupied: 10, location: { type: "Point", coordinates: [lng, lat] }, ...over });
check("open with room", shelterHasRoom(shelter("a", 0, 0)), true);
check("full status", shelterHasRoom(shelter("a", 0, 0, { status: "full" })), false);
check("closed", shelterHasRoom(shelter("a", 0, 0, { status: "closed" })), false);
check("open but no free space", shelterHasRoom(shelter("a", 0, 0, { occupied: 100 })), false);
check("one space left", shelterHasRoom(shelter("a", 0, 0, { occupied: 99 })), true);

// ---- nearest shelter: the seeded demo shelters, from Chandigarh Sector 17 ----
const demo = [
  shelter("zirakpur", 76.8173, 30.6425, { capacity: 150, occupied: 62 }),
  shelter("mohali7", 76.7179, 30.7046, { capacity: 250, occupied: 130 }),
  shelter("chd22-FULL", 76.7794, 30.7333, { capacity: 400, occupied: 400, status: "full" }),
  shelter("panchkula5", 76.8606, 30.6942, { capacity: 120, occupied: 35 }),
  shelter("derabassi", 76.847, 30.588, { capacity: 300, occupied: 90 }),
  shelter("kharar-CLOSED", 76.646, 30.746, { capacity: 80, occupied: 0, status: "closed" }),
];
const s17 = P(76.7827, 30.7398);
const n1 = findNearestShelter(s17, demo);
check("skips the full shelter 0.8 km away and picks Mohali Phase 7", n1.shelter._id, "mohali7");
near("... 7.33 km away (hand computed)", n1.distanceKm, 7.327, 0.01);
check("... to the south-west", n1.direction, "SW");
near("... bearing 237.7", n1.bearing, 237.73, 0.1);
check("nobody to send anyone to", findNearestShelter(s17, [demo[2], demo[5]]), null);
check("empty list", findNearestShelter(s17, []), null);
check("closest closed shelter is skipped even though nearer", findNearestShelter(P(76.646, 30.746), demo).shelter._id, "mohali7");
check("exact tie is settled by id, not list order", findNearestShelter(P(0, 0), [shelter("b", 1, 0), shelter("a", -1, 0)]).shelter._id, shelter("a", -1, 0)._id);
check("at the shelter: no direction", findNearestShelter(P(76.7179, 30.7046), demo).direction, null);
const south = findNearestShelter(P(0, 0), [shelter("n", 0, 0.5), shelter("s", 0, -0.2)]);
check("nearer one wins whatever the order (south)", [south.shelter._id, south.direction], ["s", "S"]);

// ---- near an active incident ----
const incident = (lng, lat, severity, status = "reported") => ({ _id: `${severity}-${status}-${lat}`, severity, status, location: { type: "Point", coordinates: [lng, lat] } });
const origin = P(76.7, 30.7);
const north = (km) => origin.lat + km / 111.195;
check("critical 1.9 km away is near", dangerousIncidentsNear(origin, [incident(76.7, north(1.9), "critical")]).length, 1);
check("high 1.9 km away is near", dangerousIncidentsNear(origin, [incident(76.7, north(1.9), "high")]).length, 1);
check("critical 2.1 km away is not", dangerousIncidentsNear(origin, [incident(76.7, north(2.1), "critical")]).length, 0);
check("medium close by is not a warning", dangerousIncidentsNear(origin, [incident(76.7, north(0.2), "medium")]).length, 0);
check("low close by is not a warning", dangerousIncidentsNear(origin, [incident(76.7, north(0.2), "low")]).length, 0);
check("resolved critical is not a warning", dangerousIncidentsNear(origin, [incident(76.7, north(0.2), "critical", "resolved")]).length, 0);
check("in progress still counts", dangerousIncidentsNear(origin, [incident(76.7, north(0.2), "high", "in_progress")]).length, 1);
check("sorted nearest first", dangerousIncidentsNear(origin, [incident(76.7, north(1.5), "high"), incident(76.7, north(0.5), "critical")]).map((x) => Math.round(x.distanceKm * 10) / 10), [0.5, 1.5]);
check("the limit is 2 km", NEAR_INCIDENT_KM, 2);

const wmap = shelterWarnings([shelter("a", 76.7, 30.7), shelter("b", 77.7, 30.7)], [incident(76.7, north(1), "critical")]);
check("warnings by shelter", [...wmap.keys()], ["a"]);
check("warning detail", [wmap.get("a").count, Math.round(wmap.get("a").nearestKm * 10) / 10], [1, 1]);

// ---- the whole answer ----
const g = buildGuidance({ from: s17, source: "device", shelters: demo, incidents: [incident(76.7179, 30.7046 + 0.5 / 111.195, "critical")] });
check("guidance: shelter", g.shelter._id, "mohali7");
check("guidance: direction", g.direction, "SW");
check("guidance: warns about the incident 0.5 km from that shelter", [g.warning.count, Math.round(g.warning.nearestKm * 10) / 10], [1, 0.5]);
check("guidance: line runs from the person to the shelter", g.line, [[76.7827, 30.7398], [76.7179, 30.7046]]);
check("guidance: no warning when nothing is near", buildGuidance({ from: s17, source: "saved", shelters: demo, incidents: [] }).warning, null);
check("guidance: remembers where the start came from", buildGuidance({ from: s17, source: "saved", shelters: demo, incidents: [] }).source, "saved");
check("guidance: none when no shelter has room", buildGuidance({ from: s17, source: "device", shelters: [demo[2]], incidents: [] }), null);

// ---- where to measure from ----
const fail = (code) => () => Promise.reject(Object.assign(new Error("x"), { code }));
check("a known device location wins", await resolveStartPoint({ device: P(1, 2), saved: P(3, 4), getLocation: fail("denied") }), { ok: true, point: P(1, 2), source: "device" });
check("asks the browser when nothing is known", await resolveStartPoint({ device: null, saved: P(3, 4), getLocation: async () => ({ lng: 5, lat: 6, accuracy: 20 }) }), { ok: true, point: P(5, 6), source: "device" });
check("falls back to the saved location when location is refused", await resolveStartPoint({ device: null, saved: P(3, 4), getLocation: fail("denied") }), { ok: true, point: P(3, 4), source: "saved" });
check("falls back to the saved location on a timeout", await resolveStartPoint({ device: null, saved: P(3, 4), getLocation: fail("timeout") }), { ok: true, point: P(3, 4), source: "saved" });
check("no location at all: say why", await resolveStartPoint({ device: null, saved: null, getLocation: fail("denied") }), { ok: false, code: "denied" });
check("no location at all, unsupported", await resolveStartPoint({ device: null, saved: null, getLocation: fail("unsupported") }), { ok: false, code: "unsupported" });

if (failures.length > 0) {
  console.error(`FAILED: ${failures.length} of ${count} checks\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`OK: ${count} checks passed`);
