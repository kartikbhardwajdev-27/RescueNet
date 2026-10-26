// Turn-by-turn directions from a route (engine.js): street names, turn directions
// and distances. Pure functions, checked in scripts/check-navigation.mjs.
//
// A route is a list of "legs" (one stretch of road each, which can be very short:
// a junction every 40 m is normal). Legs that are really the same road are
// joined into one step, and a new step starts where the person has to do
// something: turn, bear off, change road, enter or leave a roundabout.
//
// Honest limits: the directions come only from OpenStreetMap geometry and names.
// About 8 percent of the roads in this area have a name in the data, so many steps
// say "the road" or "the footpath". Turn restrictions, lanes and signs are not known.

import { bearingDeg, haversineM, turnAngle } from "./geometry.js";

// A turn smaller than this is "straight on".
export const STRAIGHT_DEG = 20;
// Between STRAIGHT_DEG and this is "bear"; up to SHARP_DEG is a turn; beyond is sharp.
export const BEAR_MAX_DEG = 45;
export const SHARP_DEG = 130;
export const UTURN_DEG = 165;
// How far either side of a junction the direction of travel is measured, so a
// few metres of curb-cutting does not read as a turn.
const BEARING_WINDOW_M = 20;

const COMPASS_WORDS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
export const compassName = (degrees) => COMPASS_WORDS[Math.round((((degrees % 360) + 360) % 360) / 45) % 8];

// What to call a road that has no name.
const UNNAMED_WORD = {
  footway: "footpath",
  path: "path",
  steps: "steps",
  cycleway: "cycle track",
  pedestrian: "pedestrian street",
  track: "track",
  service: "service road",
};
export const roadWord = (roadClass) => UNNAMED_WORD[roadClass] ?? "road";

// "Madhya Marg", or "the road" / "the footpath" for a road with no name.
const called = (name, roadClass) => (name ? name : `the ${roadWord(roadClass)}`);

// coordinates are [lng, lat]. The direction of travel arriving at index j, from a
// point about BEARING_WINDOW_M back along the route.
function bearingBefore(coordinates, j) {
  let k = j;
  let walked = 0;
  while (k > 0 && walked < BEARING_WINDOW_M) {
    walked += haversineM(coordinates[k - 1][1], coordinates[k - 1][0], coordinates[k][1], coordinates[k][0]);
    k -= 1;
  }
  return bearingDeg(coordinates[k][1], coordinates[k][0], coordinates[j][1], coordinates[j][0]);
}

// The direction of travel leaving index j, towards a point about BEARING_WINDOW_M ahead.
function bearingAfter(coordinates, j) {
  let k = j;
  let walked = 0;
  while (k < coordinates.length - 1 && walked < BEARING_WINDOW_M) {
    walked += haversineM(coordinates[k][1], coordinates[k][0], coordinates[k + 1][1], coordinates[k + 1][0]);
    k += 1;
  }
  return bearingDeg(coordinates[j][1], coordinates[j][0], coordinates[k][1], coordinates[k][0]);
}

// Signed turn in degrees at index j of the route (positive = right, 0 at the ends).
export function turnAt(coordinates, j) {
  if (j <= 0 || j >= coordinates.length - 1) return 0;
  return turnAngle(bearingBefore(coordinates, j), bearingAfter(coordinates, j));
}

// "straight" | "bear-left" | "bear-right" | "left" | "right" | "sharp-left" | "sharp-right" | "uturn"
export function maneuverFor(turn) {
  const size = Math.abs(turn);
  const side = turn < 0 ? "left" : "right";
  if (size < STRAIGHT_DEG) return "straight";
  if (size < BEAR_MAX_DEG) return `bear-${side}`;
  if (size < SHARP_DEG) return side;
  if (size < UTURN_DEG) return `sharp-${side}`;
  return "uturn";
}

const TURN_WORDS = {
  "bear-left": "Bear left",
  "bear-right": "Bear right",
  left: "Turn left",
  right: "Turn right",
  "sharp-left": "Turn sharp left",
  "sharp-right": "Turn sharp right",
  uturn: "Make a U-turn",
};

// Should the leg that starts at joint index j carry on the previous step?
function continuesStep(previous, leg, turn) {
  if (previous.roundabout !== leg.roundabout) return false;
  if (previous.roundabout) return true; // all of a roundabout is one step
  const size = Math.abs(turn);
  const sameName = previous.name !== "" && previous.name === leg.name;
  const sameClass = previous.roadClass === leg.roadClass;
  if (sameName) return size < BEAR_MAX_DEG;
  // A name that appears or disappears part way along a road is usually the same road.
  if ((previous.name === "" || leg.name === "") && sameClass) return size < STRAIGHT_DEG;
  return false;
}

// route: { coordinates: [[lng, lat], ...], legs: [{ name, roadClass, roundabout, distanceM, geometryStart, geometryEnd }] }
// Returns steps:
//   { index, maneuver, text, name, roadClass, distanceM, startIndex, endIndex, turn }
//   maneuver: "depart" | "straight" | "bear-left" | ... | "roundabout" | "roundabout-exit" | "arrive"
//   startIndex / endIndex: where the step begins and ends in route.coordinates
//   distanceM: how far the step goes (0 for the last, "arrive")
export function buildSteps(route, { destinationName = "your destination" } = {}) {
  const { coordinates, legs } = route;
  if (!legs || legs.length === 0 || coordinates.length === 0) {
    return [{ index: 0, maneuver: "arrive", text: `You are at ${destinationName}`, name: "", roadClass: "", distanceM: 0, startIndex: 0, endIndex: 0, turn: 0 }];
  }

  // 1. Group the legs.
  const groups = [];
  for (const leg of legs) {
    const current = groups[groups.length - 1];
    if (current) {
      const last = current[current.length - 1];
      if (continuesStep(last, leg, turnAt(coordinates, leg.geometryStart))) {
        current.push(leg);
        continue;
      }
    }
    groups.push([leg]);
  }

  // 2. One step per group.
  const nameOf = (group) => group[0].name || group.find((leg) => leg.name !== "")?.name || "";
  const steps = groups.map((group, index) => {
    const first = group[0];
    const name = nameOf(group);
    const distanceM = group.reduce((sum, leg) => sum + leg.distanceM, 0);
    const startIndex = first.geometryStart;
    const endIndex = group[group.length - 1].geometryEnd;
    const roadClass = first.roadClass;
    const turn = index === 0 ? 0 : turnAt(coordinates, startIndex);
    const base = { index, name, roadClass, distanceM, startIndex, endIndex, turn };

    if (first.roundabout) return { ...base, maneuver: "roundabout", text: "Enter the roundabout" };
    if (index === 0) {
      const heading = compassName(bearingAfter(coordinates, startIndex));
      return { ...base, maneuver: "depart", text: name ? `Head ${heading} on ${name}` : `Head ${heading} along ${called("", roadClass)}` };
    }
    const afterRoundabout = groups[index - 1][0].roundabout;
    if (afterRoundabout) return { ...base, maneuver: "roundabout-exit", text: `Exit the roundabout onto ${called(name, roadClass)}` };

    const maneuver = maneuverFor(turn);
    const changedRoad = name !== nameOf(groups[index - 1]);
    if (maneuver === "straight") {
      return { ...base, maneuver, text: changedRoad || !name ? `Continue onto ${called(name, roadClass)}` : `Continue on ${name}` };
    }
    return { ...base, maneuver, text: `${TURN_WORDS[maneuver]} onto ${called(name, roadClass)}` };
  });

  // 3. The end.
  const lastIndex = coordinates.length - 1;
  steps.push({
    index: steps.length,
    maneuver: "arrive",
    text: `You have arrived at ${destinationName}`,
    name: "",
    roadClass: "",
    distanceM: 0,
    startIndex: lastIndex,
    endIndex: lastIndex,
    turn: 0,
  });
  return steps;
}
