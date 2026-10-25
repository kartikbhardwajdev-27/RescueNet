// Small geometry helpers shared by the road-graph builder (scripts/) and the
// routing engine (lib/routing/). Pure functions, no browser or Node APIs.
//
// Coordinates are plain numbers in degrees (lat, lon). The graph file keeps them
// as integers in millionths of a degree (about 0.11 m); MICRO converts.

export const EARTH_RADIUS_M = 6_371_000;
export const MICRO = 1e6;

const RAD = Math.PI / 180;

// Great-circle distance in metres between two points given as degrees.
export function haversineM(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * RAD;
  const dLon = (lon2 - lon1) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Initial bearing in degrees clockwise from north (0..360) from point 1 to 2.
export function bearingDeg(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * RAD;
  const y = Math.sin(dLon) * Math.cos(lat2 * RAD);
  const x = Math.cos(lat1 * RAD) * Math.sin(lat2 * RAD) - Math.sin(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.cos(dLon);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}

// The signed turn from one bearing to the next, in -180..180 (positive = right).
export function turnAngle(fromBearing, toBearing) {
  return ((toBearing - fromBearing + 540) % 360) - 180;
}

// Metres per degree at a latitude, for the flat-earth maths used over short
// distances (snapping a point to a road segment a few hundred metres away).
export function metresPerDegree(lat) {
  return { lat: 111_195, lon: 111_195 * Math.cos(lat * RAD) };
}

// The point on segment A-B closest to P, using a local flat projection (fine for
// segments and distances of a few kilometres). Returns the fraction t along A->B
// (0..1), the closest point and its distance from P in metres.
export function projectOnSegment(pLat, pLon, aLat, aLon, bLat, bLon) {
  const m = metresPerDegree(pLat);
  const ax = (aLon - pLon) * m.lon;
  const ay = (aLat - pLat) * m.lat;
  const bx = (bLon - pLon) * m.lon;
  const by = (bLat - pLat) * m.lat;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : -(ax * dx + ay * dy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return { t, lat: aLat + t * (bLat - aLat), lon: aLon + t * (bLon - aLon), distanceM: Math.hypot(cx, cy) };
}
