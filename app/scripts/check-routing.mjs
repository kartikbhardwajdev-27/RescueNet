// Checks for the road data (Step 23):
//
//   npm run check:routing
//
//   1. The road rules (highwayRules.mjs): which tags make a road walkable / drivable.
//   2. The graph file format: write, read back, compare.
//   3. The graph builder on a small made-up map whose result is worked out by hand.
//   4. The REAL file (public/routing/tricity-roads.bin.gz), if it has been built:
//      road distance between known places divided by the straight-line distance must
//      be between 1.0 and 2.0. Anything outside is flagged as an outlier. A place with
//      no road within 300 m is reported as "outside coverage" (the rule the router
//      uses too) and is not counted as a ratio; at least 10 pairs must remain.
//
// The expected numbers in 1-3 are worked out from the rules and the geometry, not
// copied from the code's output. Part 4 uses a plain Dijkstra written here, so it
// does not depend on the routing engine in lib/routing/.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CLASS_CODE, decodeGraph, decodeGraphFile, encodeGraph, FLAG_DRIVE, FLAG_ONEWAY, FLAG_ROUNDABOUT, FLAG_WALK, ROAD_CLASSES } from "../lib/routing/format.js";
import { bearingDeg, haversineM, projectOnSegment, turnAngle } from "../lib/routing/geometry.js";
import { buildGraph, joinChains } from "./routing/graphBuilder.mjs";
import { classifyWay } from "./routing/highwayRules.mjs";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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

// ---- 0. geometry helpers ----

near("geometry: 0.001 degree of latitude", haversineM(30.7, 76.8, 30.701, 76.8), 111.195, 0.05);
near("geometry: 1 degree of longitude on the equator", haversineM(0, 0, 0, 1), 111_195, 5);
near("geometry: London to Paris", haversineM(51.5074, -0.1278, 48.8566, 2.3522), 343_500, 1000);
near("geometry: bearing due north", bearingDeg(30.7, 76.8, 30.8, 76.8), 0, 0.01);
near("geometry: bearing due east", bearingDeg(0, 0, 0, 1), 90, 0.01);
near("geometry: bearing south-west", bearingDeg(10, 10, 9, 9), 225, 0.5);
near("geometry: right turn", turnAngle(0, 90), 90, 1e-9);
near("geometry: left turn", turnAngle(350, 330), -20, 1e-9);
near("geometry: right turn across north", turnAngle(350, 10), 20, 1e-9);
near("geometry: u-turn", Math.abs(turnAngle(10, 190)), 180, 1e-9);
{
  const hit = projectOnSegment(30.7005, 76.801, 30.7, 76.8, 30.7, 76.802);
  near("geometry: point beside the middle of a segment, fraction along", hit.t, 0.5, 1e-6);
  near("geometry: and its distance (0.0005 degrees of latitude)", hit.distanceM, 55.6, 0.1);
  const before = projectOnSegment(30.7, 76.799, 30.7, 76.8, 30.7, 76.802);
  check("geometry: beyond the start the closest point is the start", before.t, 0);
  near("geometry: and the distance is to that end", before.distanceM, 0.001 * 111_195 * Math.cos((30.7 * Math.PI) / 180), 0.2);
  check("geometry: a zero-length segment does not divide by zero", projectOnSegment(30.7, 76.8, 30.7, 76.8, 30.7, 76.8).t, 0);
}

// ---- 1. road rules ----

const W = FLAG_WALK;
const D = FLAG_DRIVE;
const rule = (tags) => {
  const road = classifyWay(tags);
  return road && { cls: ROAD_CLASSES[road.cls], flags: road.flags, oneway: road.oneway, name: road.name };
};

check("residential road", rule({ highway: "residential", name: "Sector 17 Road" }), { cls: "residential", flags: W | D, oneway: 0, name: "Sector 17 Road" });
check("motorway: cars only, one-way by definition", rule({ highway: "motorway" }), { cls: "motorway", flags: D, oneway: 1, name: "" });
check("motorway_link counts as motorway", rule({ highway: "motorway_link" })?.cls, "motorway");
check("motorway oneway=no", rule({ highway: "motorway", oneway: "no" })?.oneway, 0);
check("expressway (motorroad=yes) has no pedestrians", rule({ highway: "trunk", motorroad: "yes" })?.flags, D);
check("trunk road is walkable and drivable", rule({ highway: "trunk" })?.flags, W | D);
check("footway: walking only", rule({ highway: "footway" }), { cls: "footway", flags: W, oneway: 0, name: "" });
check("steps: walking only", rule({ highway: "steps" })?.flags, W);
check("pedestrian street: walking only", rule({ highway: "pedestrian" })?.flags, W);
check("path: walking only", rule({ highway: "path" })?.flags, W);
check("track: walking only", rule({ highway: "track" })?.flags, W);
check("cycleway: walking only", rule({ highway: "cycleway" })?.flags, W);
check("footway=oneway means nothing for walking", rule({ highway: "footway", oneway: "yes" })?.oneway, 0);
check("parking aisle is dropped", rule({ highway: "service", service: "parking_aisle" }), null);
check("drive-through is dropped", rule({ highway: "service", service: "drive-through" }), null);
check("service road (not parking) is kept", rule({ highway: "service" })?.flags, W | D);
check("private road is dropped", rule({ highway: "residential", access: "private" }), null);
check("access=no but foot=yes: walking only", rule({ highway: "residential", access: "no", foot: "yes" })?.flags, W);
check("motor_vehicle=no: walking only", rule({ highway: "residential", motor_vehicle: "no" })?.flags, W);
check("foot=no: cars only", rule({ highway: "primary", foot: "no" })?.flags, D);
check("oneway=-1", rule({ highway: "residential", oneway: "-1" })?.oneway, -1);
check("oneway=yes", rule({ highway: "residential", oneway: "yes" })?.oneway, 1);
check("roundabout is one-way and flagged", rule({ highway: "residential", junction: "roundabout" }), { cls: "residential", flags: W | D | FLAG_ROUNDABOUT, oneway: 1, name: "" });
check("construction is dropped", rule({ highway: "construction" }), null);
check("proposed is dropped", rule({ highway: "proposed" }), null);
check("bridleway is dropped", rule({ highway: "bridleway" }), null);
check("area outline is dropped", rule({ highway: "pedestrian", area: "yes" }), null);
check("English name preferred", rule({ highway: "residential", name: "Madhya Marg", "name:en": "Central Road" })?.name, "Central Road");
check("road number when there is no name", rule({ highway: "primary", ref: "NH 5" })?.name, "NH 5");
check("every class has a code", ROAD_CLASSES.every((name) => CLASS_CODE[name] === ROAD_CLASSES.indexOf(name)), true);

// ---- 2. file format ----

{
  const graph = {
    bbox: [76.6, 30.55, 76.95, 30.85],
    names: ["", "Sector 17 Road", "सेक्टर 17", "Café Marg"],
    nodeLat: Int32Array.from([30_550_000, 30_700_001, 30_699_999, 30_850_000]),
    nodeLon: Int32Array.from([76_600_000, 76_800_000, 76_999_999 - 100_000, 76_950_000]),
    edges: [
      { a: 0, b: 1, lengthDm: 123_456, cls: 6, flags: 3, name: 1, shape: [30_600_000, 76_650_000, 30_650_000, 76_640_000] },
      { a: 1, b: 2, lengthDm: 1, cls: 0, flags: 6, name: 0, shape: [] },
      { a: 1, b: 0, lengthDm: 4_000_000, cls: 14, flags: 1, name: 2, shape: [30_700_000, 76_800_000] },
      { a: 3, b: 3, lengthDm: 70_000, cls: 4, flags: 3, name: 3, shape: [] },
    ],
  };
  const read = decodeGraph(encodeGraph(graph));
  check("format: bbox", read.bbox, graph.bbox);
  check("format: names (including non-Latin)", read.names, graph.names);
  check("format: node latitudes", Array.from(read.nodeLat), Array.from(graph.nodeLat));
  check("format: node longitudes", Array.from(read.nodeLon), Array.from(graph.nodeLon));
  check("format: edge a", Array.from(read.edgeA), [0, 1, 1, 3]);
  check("format: edge b (a later edge can point backwards)", Array.from(read.edgeB), [1, 2, 0, 3]);
  check("format: lengths", Array.from(read.edgeLenDm), [123_456, 1, 4_000_000, 70_000]);
  check("format: classes", Array.from(read.edgeClass), [6, 0, 14, 4]);
  check("format: flags", Array.from(read.edgeFlags), [3, 6, 1, 3]);
  check("format: name indexes", Array.from(read.edgeName), [1, 0, 2, 3]);
  check("format: shape index", Array.from(read.shapeStart), [0, 2, 2, 3, 3]);
  check("format: shape latitudes", Array.from(read.shapeLat), [30_600_000, 30_650_000, 30_700_000]);
  check("format: shape longitudes", Array.from(read.shapeLon), [76_650_000, 76_640_000, 76_800_000]);
  let refused = "";
  try {
    decodeGraph(Uint8Array.from([1, 2, 3, 4, 5]));
  } catch (error) {
    refused = error.message;
  }
  check("format: a wrong file is refused", refused, "not a RescueNet road graph file");
}

// ---- 3. the graph builder, on a small made-up map ----

// Points (lat, lon), each step is 0.001 degrees, about 111 m north-south and 96 m east-west here.
//
//            9
//            |   Trap Rd (one-way, dead end)
//            5
//            |   Cross St
//  0 -1- 2 -3- 4         Main St along the top row (nodes 1 and 3 are only bends)
//        |    |
//        6 -- 7          Foot Path joins 6 and 7 (walking only)
//   8 ...... (below)     Loop Rd (one-way) runs 4 -> 7 -> 8 -> 0, with 8 a bend
//
// Island Rd (11-12) is far away and joined to nothing.
const points = [
  [30.7, 76.8], // 0
  [30.7, 76.801], // 1
  [30.7, 76.802], // 2
  [30.7, 76.803], // 3
  [30.7, 76.804], // 4
  [30.701, 76.802], // 5
  [30.699, 76.802], // 6
  [30.699, 76.804], // 7
  [30.699, 76.8], // 8
  [30.702, 76.802], // 9
  [30.72, 76.9], // 10 (unused)
  [30.72, 76.9], // 11
  [30.721, 76.9], // 12
];
const lat = Float64Array.from(points, (p) => p[0]);
const lon = Float64Array.from(points, (p) => p[1]);
const way = (nodes, tags) => ({ nodes, ...classifyWay({ highway: "residential", ...tags }) });
const built = buildGraph({
  bbox: [76.6, 30.55, 76.95, 30.85],
  lat,
  lon,
  ways: [
    way([0, 1, 2, 3, 4], { name: "Main St" }),
    way([6, 2, 5], { name: "Cross St" }),
    way([4, 7, 8, 0], { name: "Loop Rd", oneway: "yes" }),
    way([5, 9], { name: "Trap Rd", oneway: "yes" }),
    way([6, 7], { highway: "footway", name: "Foot Path" }),
    way([11, 12], { name: "Island Rd" }),
  ],
});
{
  const read = decodeGraph(encodeGraph(built.graph));
  // Junctions and road ends: 0, 2, 4, 5, 6, 7, 9. Nodes 1, 3 and 8 are bends; the island is gone.
  check("builder: junction count", read.nodeLat.length, 7);
  check("builder: edge count (Main x2, Cross x2, Loop x2, Trap, Foot)", read.edgeA.length, 8);
  check("builder: the island road's name is gone", read.names.slice().sort(), ["", "Cross St", "Foot Path", "Loop Rd", "Main St", "Trap Rd"]);

  const edgesNamed = (name) => Array.from(read.edgeA, (_, i) => i).filter((i) => read.names[read.edgeName[i]] === name);
  const flagsOf = (name) => edgesNamed(name).map((i) => read.edgeFlags[i]);
  check("builder: Main St walk + drive", flagsOf("Main St"), [W | D, W | D]);
  check("builder: Cross St walk + drive", flagsOf("Cross St"), [W | D, W | D]);
  check("builder: Loop Rd is one-way for cars", flagsOf("Loop Rd"), [W | D | FLAG_ONEWAY, W | D | FLAG_ONEWAY]);
  check("builder: Trap Rd: a car cannot get out, so walking only", flagsOf("Trap Rd"), [W]);
  check("builder: Foot Path walking only", flagsOf("Foot Path"), [W]);
  check("builder: Foot Path class", ROAD_CLASSES[read.edgeClass[edgesNamed("Foot Path")[0]]], "footway");

  const micro = (deg) => Math.round(deg * 1e6);
  const at = (node) => [read.nodeLat[node], read.nodeLon[node]];
  const loop = edgesNamed("Loop Rd").map((i) => ({ from: at(read.edgeA[i]), to: at(read.edgeB[i]), shape: read.shapeStart[i + 1] - read.shapeStart[i] }));
  check("builder: Loop Rd points the way cars travel (4 -> 7, then 7 -> 0)", loop.find((e) => e.from[1] === micro(76.804) && e.from[0] === micro(30.7))?.to, [micro(30.699), micro(76.804)]);
  check("builder: Loop Rd second half ends at node 0", loop.find((e) => e.to[0] === micro(30.7) && e.to[1] === micro(76.8))?.from, [micro(30.699), micro(76.804)]);
  check("builder: Loop Rd second half keeps node 8 as a bend", loop.find((e) => e.to[1] === micro(76.8))?.shape, 1);

  // Lengths: 0.001 degrees of latitude is 111.195 m; of longitude, that times cos(latitude).
  const lonStep = 111.195 * Math.cos((30.7 * Math.PI) / 180);
  const lengthM = (i) => read.edgeLenDm[i] / 10;
  const main = edgesNamed("Main St").map(lengthM).sort((p, q) => p - q);
  near("builder: Main St west half is two longitude steps", main[0], 2 * lonStep, 0.6);
  near("builder: Main St east half is two longitude steps", main[1], 2 * lonStep, 0.6);
  near("builder: Foot Path is two longitude steps at 30.699", lengthM(edgesNamed("Foot Path")[0]), 2 * 111.195 * Math.cos((30.699 * Math.PI) / 180), 0.6);
  near("builder: Trap Rd is one latitude step", lengthM(edgesNamed("Trap Rd")[0]), 111.195, 0.3);
}

// Chains of roads that are really one road are joined.
{
  const line = (nodes, flags = W | D) => ({ a: nodes[0], b: nodes[1], mid: [], cls: 6, flags, name: 1 });
  const three = joinChains([line([0, 1]), line([1, 2]), line([2, 3])]);
  check("join: three bidirectional pieces become one edge", three.length, 1);
  check("join: its ends", [three[0].a, three[0].b].sort(), [0, 3]);
  check("join: its bends", [...three[0].mid].sort(), [1, 2]);

  const aligned = joinChains([line([0, 1], W | D | FLAG_ONEWAY), line([1, 2], W | D | FLAG_ONEWAY)]);
  check("join: one-ways pointing the same way", aligned.map((e) => [e.a, e.b, e.mid]), [[0, 2, [1]]]);
  const opposed = joinChains([line([0, 1], W | D | FLAG_ONEWAY), line([2, 1], W | D | FLAG_ONEWAY)]);
  check("join: one-ways pointing at each other stay apart", opposed.length, 2);
  const backwards = joinChains([line([1, 0], W | D | FLAG_ONEWAY), line([2, 1], W | D | FLAG_ONEWAY)]);
  check("join: one-ways both against the travel order are stored pointing a -> b", backwards.map((e) => [e.a, e.b, e.mid]), [[2, 0, [1]]]);
  const differentNames = joinChains([line([0, 1]), { ...line([1, 2]), name: 2 }]);
  check("join: different street names stay apart", differentNames.length, 2);
  const junction = joinChains([line([0, 1]), line([1, 2]), line([1, 3])]);
  check("join: a node with three roads is a junction", junction.length, 3);
  const loopBack = joinChains([line([0, 1]), line([1, 0])]);
  check("join: two roads between the same pair would make a loop; left alone", loopBack.length, 2);
}

// oneway=-1 is turned so that a -> b is the allowed direction.
{
  const triangle = buildGraph({
    bbox: [76.6, 30.55, 76.95, 30.85],
    lat: Float64Array.from([30.7, 30.7, 30.701]),
    lon: Float64Array.from([76.8, 76.801, 76.8005]),
    ways: [
      way([0, 1], { name: "W1", oneway: "-1" }), // may only be driven 1 -> 0
      way([0, 2], { name: "W2", oneway: "yes" }), // 0 -> 2
      way([2, 1], { name: "W3", oneway: "yes" }), // 2 -> 1
    ],
  });
  const read = decodeGraph(encodeGraph(triangle.graph));
  const w1 = Array.from(read.edgeA, (_, i) => i).find((i) => read.names[read.edgeName[i]] === "W1");
  check("oneway=-1: edge starts at node 1 (east end)", read.nodeLon[read.edgeA[w1]], 76_801_000);
  check("oneway=-1: and ends at node 0 (west end)", read.nodeLon[read.edgeB[w1]], 76_800_000);
  check("oneway=-1: all three one-ways form a loop, so cars keep them", Array.from(read.edgeFlags).every((f) => f & FLAG_DRIVE), true);
}

// ---- 4. the real file ----

// Places are approximate public coordinates (a few hundred metres either way); the
// check snaps each to the nearest road node, so exactness is not needed.
const PLACES = {
  "Chandigarh Sector 17": [30.7398, 76.7827],
  "PGIMER": [30.7646, 76.7757],
  "Mohali Phase 7": [30.7119, 76.72],
  "Zirakpur VIP Road": [30.6417, 76.818],
  "Panchkula Sector 5": [30.6942, 76.8606],
  "Sukhna Lake": [30.7421, 76.8188],
  "Rock Garden": [30.7525, 76.8101],
  "Chandigarh Railway Station": [30.694, 76.8203],
  "Chandigarh Airport": [30.6735, 76.7885],
  "PCA Stadium Mohali": [30.6906, 76.7377],
  "Elante Mall": [30.7058, 76.801],
  "Sector 43 ISBT": [30.7217, 76.7464],
  "Pinjore": [30.7972, 76.9136],
  "Kharar": [30.7459, 76.6463],
  "Dera Bassi": [30.5883, 76.8444],
};
const PAIRS = [
  ["Chandigarh Sector 17", "PGIMER"],
  ["Chandigarh Sector 17", "Mohali Phase 7"],
  ["Chandigarh Sector 17", "Zirakpur VIP Road"],
  ["Chandigarh Sector 17", "Panchkula Sector 5"],
  ["PGIMER", "Rock Garden"],
  ["Chandigarh Railway Station", "Chandigarh Airport"],
  ["Elante Mall", "PCA Stadium Mohali"],
  ["Mohali Phase 7", "Zirakpur VIP Road"],
  ["Panchkula Sector 5", "Zirakpur VIP Road"],
  ["Sukhna Lake", "Sector 43 ISBT"],
  ["Pinjore", "Chandigarh Sector 17"],
  ["Kharar", "Mohali Phase 7"],
  ["Dera Bassi", "Zirakpur VIP Road"],
];

// A binary min-heap of [priority, value].
class Heap {
  constructor() {
    this.items = [];
  }

  push(priority, value) {
    const items = this.items;
    items.push([priority, value]);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent][0] <= items[i][0]) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }

  pop() {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let smallest = i;
        if (left < items.length && items[left][0] < items[smallest][0]) smallest = left;
        if (right < items.length && items[right][0] < items[smallest][0]) smallest = right;
        if (smallest === i) break;
        [items[smallest], items[i]] = [items[i], items[smallest]];
        i = smallest;
      }
    }
    return top;
  }

  get size() {
    return this.items.length;
  }
}

// Shortest road distance in metres between two nodes for a mode (flag), or null.
function shortestMetres(graph, mode, from, to) {
  const n = graph.nodeLat.length;
  const adjacency = Array.from({ length: n }, () => []);
  for (let e = 0; e < graph.edgeA.length; e += 1) {
    if (!(graph.edgeFlags[e] & mode)) continue;
    const length = graph.edgeLenDm[e] / 10;
    adjacency[graph.edgeA[e]].push([graph.edgeB[e], length]);
    // One-way applies to cars only.
    if (mode === FLAG_WALK || !(graph.edgeFlags[e] & FLAG_ONEWAY)) adjacency[graph.edgeB[e]].push([graph.edgeA[e], length]);
  }
  const best = new Float64Array(n).fill(Infinity);
  const heap = new Heap();
  best[from] = 0;
  heap.push(0, from);
  while (heap.size > 0) {
    const [cost, node] = heap.pop();
    if (cost > best[node]) continue;
    if (node === to) return cost;
    for (const [next, length] of adjacency[node]) {
      if (cost + length < best[next]) {
        best[next] = cost + length;
        heap.push(best[next], next);
      }
    }
  }
  return null;
}

// The router refuses to snap a point to a road further away than this (Step 24).
const SNAP_LIMIT_M = 300;
const MIN_VALID_PAIRS = 10;
const outliers = [];
const outside = [];
const report = [];
const file = path.join(appRoot, "public", "routing", "tricity-roads.bin.gz");
const metaFile = path.join(appRoot, "public", "routing", "meta.json");
let realFile = "not built (run npm run routing:build); part 4 skipped";
if (fs.existsSync(file) && fs.existsSync(metaFile)) {
  const graph = await decodeGraphFile(fs.readFileSync(file));
  const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
  realFile = `${(fs.statSync(file).size / 1024 / 1024).toFixed(2)} MB, ${graph.nodeLat.length} nodes, ${graph.edgeA.length} edges`;

  check("real file: meta.json node count matches the file", meta.counts.nodes, graph.nodeLat.length);
  check("real file: meta.json edge count matches the file", meta.counts.edges, graph.edgeA.length);
  check("real file: meta.json bbox matches the file", meta.bbox, graph.bbox);
  let inside = true;
  for (let i = 0; i < graph.nodeLat.length; i += 1) {
    if (graph.nodeLat[i] < 30_550_000 || graph.nodeLat[i] > 30_850_000 || graph.nodeLon[i] < 76_600_000 || graph.nodeLon[i] > 76_950_000) inside = false;
  }
  check("real file: every node is inside the bbox", inside, true);
  check("real file: every edge is walkable or drivable", Array.from(graph.edgeFlags).every((f) => f & (FLAG_WALK | FLAG_DRIVE)), true);
  check("real file: no edge has a zero length", Array.from(graph.edgeLenDm).every((l) => l > 0), true);

  // The nearest road of a mode, by distance to the road's line (not just its junctions,
  // which are far apart on a long road): the way the router will snap. Returns the
  // distance and the end of that road nearest to the snapped point, as the route's
  // start or end.
  const nearestRoad = (place, flag) => {
    let best = { node: -1, snapM: Infinity };
    for (let e = 0; e < graph.edgeA.length; e += 1) {
      if (!(graph.edgeFlags[e] & flag)) continue;
      let pLat = graph.nodeLat[graph.edgeA[e]] / 1e6;
      let pLon = graph.nodeLon[graph.edgeA[e]] / 1e6;
      const stops = [];
      for (let k = graph.shapeStart[e]; k < graph.shapeStart[e + 1]; k += 1) stops.push([graph.shapeLat[k] / 1e6, graph.shapeLon[k] / 1e6]);
      stops.push([graph.nodeLat[graph.edgeB[e]] / 1e6, graph.nodeLon[graph.edgeB[e]] / 1e6]);
      for (const [qLat, qLon] of stops) {
        const hit = projectOnSegment(place[0], place[1], pLat, pLon, qLat, qLon);
        if (hit.distanceM < best.snapM) {
          const toA = haversineM(hit.lat, hit.lon, graph.nodeLat[graph.edgeA[e]] / 1e6, graph.nodeLon[graph.edgeA[e]] / 1e6);
          const toB = haversineM(hit.lat, hit.lon, graph.nodeLat[graph.edgeB[e]] / 1e6, graph.nodeLon[graph.edgeB[e]] / 1e6);
          best = { node: toA <= toB ? graph.edgeA[e] : graph.edgeB[e], snapM: hit.distanceM };
        }
        pLat = qLat;
        pLon = qLon;
      }
    }
    return best;
  };

  for (const [mode, flag] of [["walk", FLAG_WALK], ["drive", FLAG_DRIVE]]) {
    for (const [fromName, toName] of PAIRS) {
      const from = nearestRoad(PLACES[fromName], flag);
      const to = nearestRoad(PLACES[toName], flag);
      const straight = haversineM(graph.nodeLat[from.node] / 1e6, graph.nodeLon[from.node] / 1e6, graph.nodeLat[to.node] / 1e6, graph.nodeLon[to.node] / 1e6);
      const road = shortestMetres(graph, flag, from.node, to.node);
      const ratio = road === null ? null : road / straight;
      const snapM = Math.max(from.snapM, to.snapM);
      const far = snapM > SNAP_LIMIT_M;
      const bad = !far && (ratio === null || ratio < 1.0 || ratio > 2.0);
      const row = { mode, pair: `${fromName} -> ${toName}`, straightKm: straight / 1000, roadKm: road === null ? null : road / 1000, ratio, snapM, far, bad };
      report.push(row);
      if (far) outside.push(row);
      else if (bad) outliers.push(row);
    }
    const valid = PAIRS.length - outside.filter((r) => r.mode === mode).length;
    check(`real file (${mode}): at least ${MIN_VALID_PAIRS} place pairs are close enough to a road to test`, valid >= MIN_VALID_PAIRS, true);
  }
  count += report.length;
}

console.log(`Road graph: ${realFile}`);
if (report.length > 0) {
  console.log(`\nRoad distance / straight-line distance (must be 1.0 to 2.0; straight line is between the snapped road points)`);
  for (const row of report) {
    const km = (v) => (v === null ? "  n/a " : `${v.toFixed(2).padStart(6)}`);
    const status = row.far ? "OUTSIDE" : row.bad ? "OUTLIER" : "ok     ";
    console.log(
      `  ${status} ${row.mode.padEnd(5)} ${row.pair.padEnd(58)} straight ${km(row.straightKm)} km, road ${km(row.roadKm)} km, ratio ${row.ratio === null ? "unreachable" : row.ratio.toFixed(2)}, snap ${row.snapM.toFixed(0)} m`,
    );
  }
  const counted = report.filter((r) => !r.far && r.ratio !== null);
  const ratios = counted.map((r) => r.ratio);
  console.log(`\n  ${report.length} routes tried (${PAIRS.length} place pairs x walk and drive); ${counted.length} counted, ratio range ${Math.min(...ratios).toFixed(2)} to ${Math.max(...ratios).toFixed(2)}`);
  console.log(`  ${outliers.length} outlier(s) outside 1.0 to 2.0; ${outside.length} outside coverage (no kept road within ${SNAP_LIMIT_M} m of the place, the same limit the router will use)`);
  for (const row of outside) console.log(`    outside coverage: ${row.pair} (${row.mode}): nearest kept road line is ${row.snapM.toFixed(0)} m from the given coordinates`);
  for (const row of outliers) failures.push(`outlier: ${row.mode} ${row.pair} ratio ${row.ratio === null ? "unreachable" : row.ratio.toFixed(2)}`);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} of ${count} checks FAILED:\n`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`\nAll ${count} routing data checks passed.`);
