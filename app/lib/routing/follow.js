// "Start" mode: working out where a moving person is on a route, which step they
// are on, whether they have left the route, and when to work out a new one.
// Pure functions, checked in scripts/check-navigation.mjs.

import { haversineM, projectOnSegment } from "./geometry.js";

// More than this far from the route counts as off it (60 m, as specified).
export const OFF_ROUTE_M = 60;
// Closer than this to the end is "arrived".
export const ARRIVED_M = 25;
// A new route is worked out only after this many fixes in a row were off the route,
// and not more often than the cooldown: one noisy GPS reading must not send the
// person on a detour, and a route should not be recalculated every second.
export const REROUTE_AFTER_FIXES = 2;
export const REROUTE_COOLDOWN_MS = 8000;
// A fix whose own accuracy circle is wider than this says nothing reliable about
// being off the route.
export const MAX_FIX_ACCURACY_M = 100;

// Distance in metres from the start to each point of the route, kept per route.
const profiles = new WeakMap();
function cumulative(route) {
  let known = profiles.get(route);
  if (!known) {
    const { coordinates } = route;
    known = new Float64Array(coordinates.length);
    for (let i = 1; i < coordinates.length; i += 1) {
      known[i] = known[i - 1] + haversineM(coordinates[i - 1][1], coordinates[i - 1][0], coordinates[i][1], coordinates[i][0]);
    }
    profiles.set(route, known);
  }
  return known;
}

// Where the point { lat, lon } is relative to route.coordinates ([[lng, lat], ...]):
//   { segment, distanceM, alongM, remainingM, totalM, snapped: { lat, lon } }
// segment i is the stretch from coordinate i to i + 1; distanceM is how far the point is
// from the route; alongM / remainingM are measured along the route.
// `hintSegment` is where the person was last time: segments near it are tried first, so a
// route that doubles back on itself does not make the person jump forward or back.
export function locateOnRoute(route, point, hintSegment = 0) {
  const { coordinates } = route;
  const along = cumulative(route);
  const total = along[along.length - 1] ?? 0;
  if (coordinates.length < 2) {
    const only = coordinates[0] ?? [point.lon, point.lat];
    return { segment: 0, distanceM: haversineM(point.lat, point.lon, only[1], only[0]), alongM: 0, remainingM: 0, totalM: 0, snapped: { lat: only[1], lon: only[0] } };
  }

  // Among segments about equally close (within 5 m), the one nearest the last known
  // place wins; that is what keeps someone on the way back from being placed on the
  // way out of a route that doubles back.
  const TIE_M = 5;
  const scan = (from, to) => {
    let best = null;
    for (let i = Math.max(0, from); i <= Math.min(coordinates.length - 2, to); i += 1) {
      const a = coordinates[i];
      const b = coordinates[i + 1];
      const hit = projectOnSegment(point.lat, point.lon, a[1], a[0], b[1], b[0]);
      if (!best || hit.distanceM < best.distanceM - TIE_M || (hit.distanceM <= best.distanceM + TIE_M && Math.abs(i - hintSegment) < Math.abs(best.segment - hintSegment))) {
        best = { ...hit, segment: i };
      }
    }
    return best;
  };

  // Near the last known place first; the whole route when that is not close.
  let best = scan(hintSegment - 10, hintSegment + 80);
  if (!best || best.distanceM > 30) {
    const everywhere = scan(0, coordinates.length - 2);
    if (!best || everywhere.distanceM < best.distanceM - 5) best = everywhere;
  }
  const alongM = along[best.segment] + best.t * (along[best.segment + 1] - along[best.segment]);
  return { segment: best.segment, distanceM: best.distanceM, alongM, remainingM: Math.max(0, total - alongM), totalM: total, snapped: { lat: best.lat, lon: best.lon } };
}

// The step a person on segment `segment` is on (steps from instructions.js). The last
// step, "arrive", is only current once they are at the end.
export function stepAt(steps, segment, arrived = false) {
  if (arrived) return steps.length - 1;
  let current = 0;
  for (let i = 0; i < steps.length - 1; i += 1) {
    if (steps[i].startIndex <= segment) current = i;
  }
  return current;
}

// One position fix against a route.
//   route, steps   as above
//   fix            { lat, lon, accuracy? } (accuracy in metres)
//   hintSegment    the segment from the last fix
// -> { ...locateOnRoute, offRoute, arrived, stepIndex, usable }
// `usable` is false when the fix is too inaccurate to judge being off the route by.
export function progressOnRoute(route, steps, fix, hintSegment = 0) {
  const located = locateOnRoute(route, fix, hintSegment);
  const arrived = located.remainingM <= ARRIVED_M && located.distanceM <= OFF_ROUTE_M;
  return {
    ...located,
    offRoute: located.distanceM > OFF_ROUTE_M,
    arrived,
    stepIndex: stepAt(steps, located.segment, arrived),
    usable: !(Number.isFinite(fix.accuracy) && fix.accuracy > MAX_FIX_ACCURACY_M),
  };
}

export const initialRerouteState = () => ({ offCount: 0, lastRerouteAt: -Infinity });

// Decides whether to work out a new route after a fix.
//   state   from initialRerouteState() / the last call
//   input   { offRoute, usable, now }
// -> { state, reroute }
export function nextRerouteState(state, { offRoute, usable = true, now }) {
  if (!usable) return { state, reroute: false };
  if (!offRoute) return { state: { ...state, offCount: 0 }, reroute: false };
  const offCount = state.offCount + 1;
  if (offCount >= REROUTE_AFTER_FIXES && now - state.lastRerouteAt >= REROUTE_COOLDOWN_MS) {
    return { state: { offCount: 0, lastRerouteAt: now }, reroute: true };
  }
  return { state: { ...state, offCount }, reroute: false };
}
