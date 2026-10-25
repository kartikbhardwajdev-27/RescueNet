// The routing engine: finds a road route between two points on the offline road
// graph (lib/routing/format.js). Pure JavaScript with no browser or Node APIs, so
// it runs the same in the Web Worker (routing.worker.js), on the main thread, and
// in the tests (npm run check:engine).
//
//   const router = createRouter(decodedGraph);
//   router.route({ from: {lat, lon}, to: {lat, lon}, profile: "walk" | "drive", zones })
//
// How it works
//   - Snapping: a point is snapped to the nearest road (of the profile) within 300 m,
//     to the exact spot on the road's line, not just to a junction. Further than that
//     the answer is "outside coverage".
//   - Search: A* with a binary heap and a haversine (straight-line) heuristic. A route
//     can start and end in the middle of a road: the search begins at the road's two
//     ends and finishes through either end, each with the cost of the part road.
//   - Cost is estimated travel time in seconds: length divided by an assumed speed for
//     the road class. These speeds are assumptions, not measurements, and know nothing
//     about traffic (see docs/NAVIGATION.md). `metric: "distance"` makes the cost metres.
//   - Profiles: "drive" obeys one-way roads and uses only roads cars may use; "walk"
//     ignores one-ways and uses roads and paths people may walk (no motorways).
//   - Avoid zones: circles (200 m round active flood, fire or earthquake incidents of
//     high or critical severity). A road that comes within a zone costs 10x, it is
//     never blocked, and the result lists the zones the route still crosses.

import { FLAG_DRIVE, FLAG_ONEWAY, FLAG_ROUNDABOUT, FLAG_WALK, ROAD_CLASSES } from "./format.js";
import { haversineM, MICRO, projectOnSegment } from "./geometry.js";

export const SNAP_LIMIT_M = 300;
export const ZONE_RADIUS_M = 200;
export const ZONE_COST_FACTOR = 10;
// A stretch of road shorter than this is treated as no stretch at all.
const MIN_PART_M = 0.05;

// Assumed speeds in km/h. Deliberately modest, for city streets; they only decide
// which route is cheapest and the time shown as an estimate.
const DRIVE_KMH = { motorway: 80, trunk: 50, primary: 40, secondary: 35, tertiary: 30, unclassified: 25, residential: 25, service: 15, living_street: 10 };
const WALK_KMH = { steps: 3, track: 4, path: 4 };
const WALK_DEFAULT_KMH = 4.8;

export const PROFILES = {
  drive: { flag: FLAG_DRIVE, ignoresOneway: false },
  walk: { flag: FLAG_WALK, ignoresOneway: true },
};

// Metres per second for a road class under a profile.
export function speedMps(profile, className) {
  const kmh = profile === "drive" ? (DRIVE_KMH[className] ?? 20) : (WALK_KMH[className] ?? WALK_DEFAULT_KMH);
  return kmh / 3.6;
}

const MAX_SPEED_MPS = { drive: Math.max(...ROAD_CLASSES.map((name) => speedMps("drive", name))), walk: Math.max(...ROAD_CLASSES.map((name) => speedMps("walk", name))) };

// ---- a binary min-heap ----

// Entries are (priority, node, cost so far). Stale entries are skipped by the search
// instead of being removed.
export class MinHeap {
  constructor(capacity = 1024) {
    this.keys = new Float64Array(capacity);
    this.nodes = new Int32Array(capacity);
    this.costs = new Float64Array(capacity);
    this.size = 0;
    this.popNode = 0;
    this.popCost = 0;
  }

  clear() {
    this.size = 0;
  }

  push(key, node, cost) {
    if (this.size === this.keys.length) this.grow();
    let i = this.size++;
    const { keys, nodes, costs } = this;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (keys[parent] <= key) break;
      keys[i] = keys[parent];
      nodes[i] = nodes[parent];
      costs[i] = costs[parent];
      i = parent;
    }
    keys[i] = key;
    nodes[i] = node;
    costs[i] = cost;
  }

  // The smallest entry's priority; call peekKey() first, then pop() to read it into
  // popNode / popCost.
  peekKey() {
    return this.keys[0];
  }

  pop() {
    const { keys, nodes, costs } = this;
    this.popNode = nodes[0];
    this.popCost = costs[0];
    const last = --this.size;
    if (last > 0) {
      const key = keys[last];
      const node = nodes[last];
      const cost = costs[last];
      let i = 0;
      for (;;) {
        let child = 2 * i + 1;
        if (child >= last) break;
        if (child + 1 < last && keys[child + 1] < keys[child]) child += 1;
        if (keys[child] >= key) break;
        keys[i] = keys[child];
        nodes[i] = nodes[child];
        costs[i] = costs[child];
        i = child;
      }
      keys[i] = key;
      nodes[i] = node;
      costs[i] = cost;
    }
  }

  grow() {
    const capacity = this.keys.length * 2;
    for (const name of ["keys", "costs"]) {
      const bigger = new Float64Array(capacity);
      bigger.set(this[name]);
      this[name] = bigger;
    }
    const bigger = new Int32Array(capacity);
    bigger.set(this.nodes);
    this.nodes = bigger;
  }
}

// ---- avoid zones ----

// Incidents that make a road dangerous to route through.
export const AVOID_TYPES = ["flood", "fire", "earthquake"];
export const AVOID_SEVERITIES = ["high", "critical"];

// Turns incidents (as the API returns them: { _id, type, severity, status,
// location: { coordinates: [lng, lat] } }) into avoid zones. Resolved incidents and
// other types or severities make none.
export function zonesFromIncidents(incidents, radiusM = ZONE_RADIUS_M) {
  const zones = [];
  for (const incident of incidents ?? []) {
    if (incident.status === "resolved") continue;
    if (!AVOID_TYPES.includes(incident.type) || !AVOID_SEVERITIES.includes(incident.severity)) continue;
    const coordinates = incident.location?.coordinates;
    if (!Array.isArray(coordinates) || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) continue;
    zones.push({ id: String(incident._id), type: incident.type, severity: incident.severity, lat: coordinates[1], lon: coordinates[0], radiusM });
  }
  return zones;
}

// ---- the router ----

export function createRouter(graph) {
  const nodeCount = graph.nodeLat.length;
  const edgeCount = graph.edgeA.length;
  const nodeLat = Float64Array.from(graph.nodeLat, (v) => v / MICRO);
  const nodeLon = Float64Array.from(graph.nodeLon, (v) => v / MICRO);
  const lenM = Float64Array.from(graph.edgeLenDm, (v) => v / 10);
  const { edgeA, edgeB, edgeFlags, edgeClass, edgeName, names } = graph;

  // -- road segments: every straight piece of every road's line --
  // Segments of edge e are segFirst[e] .. segFirst[e + 1] - 1, in order from node a.
  const segFirst = new Uint32Array(edgeCount + 1);
  const segCount = graph.shapeLat.length + edgeCount;
  const segEdge = new Int32Array(segCount);
  const segALat = new Float64Array(segCount);
  const segALon = new Float64Array(segCount);
  const segBLat = new Float64Array(segCount);
  const segBLon = new Float64Array(segCount);
  const segOffset = new Float64Array(segCount); // metres along the line to the segment's start
  const segLen = new Float64Array(segCount);
  const polyLen = new Float64Array(edgeCount); // length of the edge's drawn line
  {
    let s = 0;
    for (let e = 0; e < edgeCount; e += 1) {
      segFirst[e] = s;
      let pLat = nodeLat[edgeA[e]];
      let pLon = nodeLon[edgeA[e]];
      let offset = 0;
      const last = graph.shapeStart[e + 1];
      for (let k = graph.shapeStart[e]; k <= last; k += 1) {
        const qLat = k < last ? graph.shapeLat[k] / MICRO : nodeLat[edgeB[e]];
        const qLon = k < last ? graph.shapeLon[k] / MICRO : nodeLon[edgeB[e]];
        const length = haversineM(pLat, pLon, qLat, qLon);
        segEdge[s] = e;
        segALat[s] = pLat;
        segALon[s] = pLon;
        segBLat[s] = qLat;
        segBLon[s] = qLon;
        segOffset[s] = offset;
        segLen[s] = length;
        offset += length;
        pLat = qLat;
        pLon = qLon;
        s += 1;
      }
      polyLen[e] = offset;
    }
    segFirst[edgeCount] = s;
  }

  // -- a grid over the segments, for finding roads near a point --
  const [west, south, east, north] = graph.bbox;
  const midLat = (south + north) / 2;
  const cellLat = 250 / 111_195; // about 250 m
  const cellLon = 250 / (111_195 * Math.cos((midLat * Math.PI) / 180));
  const columns = Math.max(1, Math.ceil((east - west) / cellLon));
  const rows = Math.max(1, Math.ceil((north - south) / cellLat));
  const clampColumn = (lon) => Math.min(columns - 1, Math.max(0, Math.floor((lon - west) / cellLon)));
  const clampRow = (lat) => Math.min(rows - 1, Math.max(0, Math.floor((lat - south) / cellLat)));
  const cellStart = new Uint32Array(columns * rows + 1);
  let cellItems;
  {
    const eachCell = (s, visit) => {
      const c0 = clampColumn(Math.min(segALon[s], segBLon[s]));
      const c1 = clampColumn(Math.max(segALon[s], segBLon[s]));
      const r0 = clampRow(Math.min(segALat[s], segBLat[s]));
      const r1 = clampRow(Math.max(segALat[s], segBLat[s]));
      for (let r = r0; r <= r1; r += 1) for (let c = c0; c <= c1; c += 1) visit(r * columns + c);
    };
    for (let s = 0; s < segCount; s += 1) eachCell(s, (cell) => (cellStart[cell + 1] += 1));
    for (let i = 0; i < columns * rows; i += 1) cellStart[i + 1] += cellStart[i];
    cellItems = new Int32Array(cellStart[columns * rows]);
    const fill = cellStart.slice(0, columns * rows);
    for (let s = 0; s < segCount; s += 1) eachCell(s, (cell) => (cellItems[fill[cell]++] = s));
  }

  // Calls visit(segment) for the segments in the grid cells within radiusM of a point
  // (some of them are further away; the caller measures).
  function nearSegments(lat, lon, radiusM, visit) {
    const dLat = radiusM / 111_195;
    const dLon = radiusM / (111_195 * Math.cos((lat * Math.PI) / 180));
    const c0 = clampColumn(lon - dLon);
    const c1 = clampColumn(lon + dLon);
    const r0 = clampRow(lat - dLat);
    const r1 = clampRow(lat + dLat);
    for (let r = r0; r <= r1; r += 1) {
      for (let c = c0; c <= c1; c += 1) {
        const cell = r * columns + c;
        for (let i = cellStart[cell]; i < cellStart[cell + 1]; i += 1) visit(cellItems[i]);
      }
    }
  }

  // The nearest road of a profile within maxM of a point:
  // { edge, lat, lon, distanceM, offsetM (along the edge from its node a), edgeLenM } or null.
  function snap(lat, lon, profile, maxM = SNAP_LIMIT_M) {
    const flag = PROFILES[profile].flag;
    let best = null;
    nearSegments(lat, lon, maxM, (s) => {
      const e = segEdge[s];
      if (!(edgeFlags[e] & flag)) return;
      const hit = projectOnSegment(lat, lon, segALat[s], segALon[s], segBLat[s], segBLon[s]);
      if (hit.distanceM > maxM) return;
      if (best && (hit.distanceM > best.distanceM || (hit.distanceM === best.distanceM && e >= best.edge))) return;
      const along = segOffset[s] + hit.t * segLen[s];
      best = { edge: e, lat: hit.lat, lon: hit.lon, distanceM: hit.distanceM, offsetM: polyLen[e] > 0 ? (along / polyLen[e]) * lenM[e] : 0, edgeLenM: lenM[e] };
    });
    return best;
  }

  // The drawn line of edge e between two distances along it (metres from node a,
  // from <= to), as [[lat, lon], ...] ordered from node a towards node b.
  function slice(e, fromM, toM) {
    const scale = lenM[e] > 0 ? polyLen[e] / lenM[e] : 0;
    const x0 = fromM * scale;
    const x1 = toM * scale;
    const pointAt = (x) => {
      for (let s = segFirst[e]; s < segFirst[e + 1]; s += 1) {
        if (x <= segOffset[s] + segLen[s] || s === segFirst[e + 1] - 1) {
          const t = segLen[s] > 0 ? Math.min(1, Math.max(0, (x - segOffset[s]) / segLen[s])) : 0;
          // Exactly the segment's own ends at t = 0 and 1, so joints between roads match.
          if (t < 1e-9) return [segALat[s], segALon[s]];
          if (t > 1 - 1e-9) return [segBLat[s], segBLon[s]];
          return [segALat[s] + t * (segBLat[s] - segALat[s]), segALon[s] + t * (segBLon[s] - segALon[s])];
        }
      }
      return [nodeLat[edgeA[e]], nodeLon[edgeA[e]]];
    };
    const points = [pointAt(x0)];
    for (let s = segFirst[e]; s < segFirst[e + 1]; s += 1) {
      const end = segOffset[s] + segLen[s];
      if (end > x0 && end < x1) points.push([segBLat[s], segBLon[s]]);
    }
    points.push(pointAt(x1));
    return points;
  }

  // -- the graph as arcs a search can follow, per profile and metric --
  const adjacencyCache = new Map();
  function adjacency(profile, metric) {
    const key = `${profile}/${metric}`;
    const cached = adjacencyCache.get(key);
    if (cached) return cached;
    const { flag, ignoresOneway } = PROFILES[profile];
    const start = new Uint32Array(nodeCount + 1);
    const usable = (e) => (edgeFlags[e] & flag) !== 0;
    const backwardOk = (e) => ignoresOneway || !(edgeFlags[e] & FLAG_ONEWAY);
    for (let e = 0; e < edgeCount; e += 1) {
      if (!usable(e)) continue;
      start[edgeA[e] + 1] += 1;
      if (backwardOk(e)) start[edgeB[e] + 1] += 1;
    }
    for (let i = 0; i < nodeCount; i += 1) start[i + 1] += start[i];
    const arcEdge = new Int32Array(start[nodeCount]);
    const arcTo = new Int32Array(start[nodeCount]);
    const arcReverse = new Uint8Array(start[nodeCount]);
    const arcCost = new Float64Array(start[nodeCount]);
    const fill = start.slice(0, nodeCount);
    for (let e = 0; e < edgeCount; e += 1) {
      if (!usable(e)) continue;
      const cost = lenM[e] / (metric === "distance" ? 1 : speedMps(profile, ROAD_CLASSES[edgeClass[e]]));
      let i = fill[edgeA[e]]++;
      arcEdge[i] = e;
      arcTo[i] = edgeB[e];
      arcCost[i] = cost;
      if (backwardOk(e)) {
        i = fill[edgeB[e]]++;
        arcEdge[i] = e;
        arcTo[i] = edgeA[e];
        arcReverse[i] = 1;
        arcCost[i] = cost;
      }
    }
    const built = { start, arcEdge, arcTo, arcReverse, arcCost };
    adjacencyCache.set(key, built);
    return built;
  }

  // -- avoid zones: which edges come within a zone --
  // Returns { factor: Uint8Array (1 or ZONE_COST_FACTOR per edge), byEdge: Map(edge -> [zone index]) }.
  function applyZones(zones) {
    const factor = new Uint8Array(edgeCount).fill(1);
    const byEdge = new Map();
    zones.forEach((zone, index) => {
      nearSegments(zone.lat, zone.lon, zone.radiusM, (s) => {
        const e = segEdge[s];
        const hit = projectOnSegment(zone.lat, zone.lon, segALat[s], segALon[s], segBLat[s], segBLon[s]);
        if (hit.distanceM > zone.radiusM) return;
        factor[e] = ZONE_COST_FACTOR;
        const list = byEdge.get(e);
        if (!list) byEdge.set(e, [index]);
        else if (!list.includes(index)) list.push(index);
      });
    });
    return { factor, byEdge };
  }

  // -- the search --
  const heap = new MinHeap();
  const best = new Float64Array(nodeCount);
  const seen = new Uint32Array(nodeCount); // search number that last set best[node]
  const prevArc = new Int32Array(nodeCount); // arc used to reach the node; -1 = from the start point
  const prevNode = new Int32Array(nodeCount);
  let searchNumber = 0;

  // Cheapest way from snap S to snap T. Returns null (no route) or
  // { cost, parts: [{ edge, reverse, fromM, toM }], expanded }.
  function search(profile, metric, S, T, factor, useHeuristic) {
    const { ignoresOneway } = PROFILES[profile];
    const { start, arcEdge, arcTo, arcReverse, arcCost } = adjacency(profile, metric);
    const speedOf = (e) => (metric === "distance" ? 1 : speedMps(profile, ROAD_CLASSES[edgeClass[e]]));
    const partCost = (e, metres) => (metres / speedOf(e)) * factor[e];
    const bidirectional = (e) => ignoresOneway || !(edgeFlags[e] & FLAG_ONEWAY);
    const hSpeed = metric === "distance" ? 1 : MAX_SPEED_MPS[profile];

    let bestTotal = Infinity;
    let finish = null; // how the best route ends: { node, reverse } or { direct: true }

    // Same road, going the allowed way: no search needed to get a candidate.
    let direct = null;
    if (S.edge === T.edge) {
      const e = S.edge;
      if (T.offsetM >= S.offsetM) direct = { reverse: false, metres: T.offsetM - S.offsetM };
      else if (bidirectional(e)) direct = { reverse: true, metres: S.offsetM - T.offsetM };
      if (direct) {
        bestTotal = partCost(e, direct.metres);
        finish = { direct: true };
      }
    }

    searchNumber += 1;
    heap.clear();
    const h = (node) => (useHeuristic ? haversineM(nodeLat[node], nodeLon[node], T.lat, T.lon) / hSpeed : 0);
    const reach = (node, cost, arc, from) => {
      if (seen[node] === searchNumber && best[node] <= cost) return;
      seen[node] = searchNumber;
      best[node] = cost;
      prevArc[node] = arc;
      prevNode[node] = from;
      heap.push(cost + h(node), node, cost);
    };
    // From the start point to the two ends of its road.
    reach(edgeB[S.edge], partCost(S.edge, S.edgeLenM - S.offsetM), -1, -1);
    if (bidirectional(S.edge)) reach(edgeA[S.edge], partCost(S.edge, S.offsetM), -2, -1);

    // The ways into the end point: through node a going forward, node b going back.
    const endA = edgeA[T.edge];
    const endB = edgeB[T.edge];
    const costViaA = partCost(T.edge, T.offsetM);
    const costViaB = bidirectional(T.edge) ? partCost(T.edge, T.edgeLenM - T.offsetM) : Infinity;

    let expanded = 0;
    while (heap.size > 0) {
      if (heap.peekKey() >= bestTotal) break;
      heap.pop();
      const node = heap.popNode;
      const cost = heap.popCost;
      if (cost > best[node]) continue; // a cheaper way to this node was found since
      expanded += 1;
      if (node === endA && cost + costViaA < bestTotal) {
        bestTotal = cost + costViaA;
        finish = { node, reverse: false };
      }
      if (node === endB && cost + costViaB < bestTotal) {
        bestTotal = cost + costViaB;
        finish = { node, reverse: true };
      }
      for (let i = start[node]; i < start[node + 1]; i += 1) {
        reach(arcTo[i], cost + arcCost[i] * factor[arcEdge[i]], i, node);
      }
    }
    if (!finish) return null;

    // Walk back from the end to the start, collecting the parts of roads used.
    const parts = [];
    if (finish.direct) {
      const e = S.edge;
      parts.push({ edge: e, reverse: direct.reverse, fromM: S.offsetM, toM: T.offsetM });
    } else {
      // The last part, onto the end point.
      parts.push(finish.reverse ? { edge: T.edge, reverse: true, fromM: T.edgeLenM, toM: T.offsetM } : { edge: T.edge, reverse: false, fromM: 0, toM: T.offsetM });
      let node = finish.node;
      while (prevArc[node] >= 0) {
        const arc = prevArc[node];
        const e = arcEdge[arc];
        parts.push(arcReverse[arc] ? { edge: e, reverse: true, fromM: lenM[e], toM: 0 } : { edge: e, reverse: false, fromM: 0, toM: lenM[e] });
        node = prevNode[node];
      }
      // The first part, off the start point. -1 means it left through node b, -2 through node a.
      parts.push(prevArc[node] === -1 ? { edge: S.edge, reverse: false, fromM: S.offsetM, toM: S.edgeLenM } : { edge: S.edge, reverse: true, fromM: S.offsetM, toM: 0 });
      parts.reverse();
    }
    return { cost: bestTotal, parts, expanded };
  }

  // -- putting a route together --

  function describe(parts, byEdge, zones, profile) {
    const coordinates = []; // [lng, lat]
    const legs = [];
    let distanceM = 0;
    let durationS = 0;
    const crossed = new Set();
    // A point that sits exactly on a junction can leave a part of road of no length on a
    // neighbouring road ("0 m along West Av"). Those are not part of the journey.
    const real = parts.filter((part) => Math.abs(part.toM - part.fromM) > MIN_PART_M);
    for (const part of real.length > 0 ? real : parts.slice(0, 1)) {
      const e = part.edge;
      const lo = Math.min(part.fromM, part.toM);
      const hi = Math.max(part.fromM, part.toM);
      const metres = hi - lo;
      let points = slice(e, lo, hi);
      if (part.reverse) points = points.reverse();
      const geometryStart = coordinates.length === 0 ? 0 : coordinates.length - 1;
      for (const [la, lo2] of points) {
        const last = coordinates[coordinates.length - 1];
        if (!last || Math.abs(last[0] - lo2) > 1e-9 || Math.abs(last[1] - la) > 1e-9) coordinates.push([lo2, la]);
      }
      const geometryEnd = coordinates.length - 1;
      const className = ROAD_CLASSES[edgeClass[e]];
      const zoneList = byEdge.get(e);
      if (zoneList) for (const z of zoneList) crossed.add(z);
      legs.push({
        edge: e,
        name: names[edgeName[e]],
        roadClass: className,
        roundabout: (edgeFlags[e] & FLAG_ROUNDABOUT) !== 0,
        distanceM: metres,
        geometryStart,
        geometryEnd,
        inAvoidZone: Boolean(zoneList),
      });
      distanceM += metres;
      durationS += metres / speedMps(profile, className);
    }
    return { coordinates, legs, distanceM, durationS, crossedZones: [...crossed].sort((p, q) => p - q).map((i) => zones[i]) };
  }

  // The public call.
  //   from, to      { lat, lon }
  //   profile       "walk" | "drive"
  //   zones         avoid zones: [{ id, lat, lon, radiusM, ... }]
  //   metric        "time" (default) or "distance"
  //   heuristic     false searches without the straight-line guess (plain Dijkstra), for checking
  // Resolves to one of
  //   { status: "ok", profile, distanceM, durationS, cost, coordinates, legs, crossedZones, from, to, expanded }
  //   { status: "outside-coverage", where: "start" | "end" | "both", snapLimitM }
  //   { status: "no-route" }
  function route({ from, to, profile = "walk", zones = [], metric = "time", heuristic = true }) {
    if (!PROFILES[profile]) throw new Error(`Unknown profile "${profile}"`);
    const S = snap(from.lat, from.lon, profile);
    const T = snap(to.lat, to.lon, profile);
    if (!S || !T) return { status: "outside-coverage", where: !S && !T ? "both" : !S ? "start" : "end", snapLimitM: SNAP_LIMIT_M };
    const { factor, byEdge } = applyZones(zones);
    const found = search(profile, metric, S, T, factor, heuristic);
    if (!found) return { status: "no-route" };
    const built = describe(found.parts, byEdge, zones, profile);
    return {
      status: "ok",
      profile,
      distanceM: built.distanceM,
      durationS: built.durationS,
      cost: found.cost,
      coordinates: built.coordinates,
      legs: built.legs,
      crossedZones: built.crossedZones,
      from: { lat: S.lat, lon: S.lon, snapDistanceM: S.distanceM },
      to: { lat: T.lat, lon: T.lon, snapDistanceM: T.distanceM },
      expanded: found.expanded,
    };
  }

  return {
    route,
    snap,
    stats: { nodes: nodeCount, edges: edgeCount, segments: segCount, gridCells: columns * rows },
    bbox: graph.bbox,
  };
}
