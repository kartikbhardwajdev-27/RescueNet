// Checks for the routing engine (Step 24):
//
//   npm run check:engine
//
//   1. A small made-up road grid on the equator, where 0.002 degrees is 222.39 m, so
//      every expected distance below is worked out by hand: one-ways, the walk and
//      drive profiles, starting and ending in the middle of a road, "outside
//      coverage", avoid zones, and the cheapest of several places.
//   2. The binary heap.
//   3. Saving the road graph on the device (the offline cache) with a pretend network
//      and a pretend database.
//   4. The routing service and the client that talks to the worker.
//   5. The REAL road graph: A* gives the same cost as plain Dijkstra, the distances
//      match an independent Dijkstra (scripts/check-routing.mjs), places off the roads
//      are refused, an avoid zone is respected, and how fast it all is.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodeGraph, decodeGraphFile, encodeGraph } from "../lib/routing/format.js";
import { createRouter, MinHeap, speedMps, zonesFromIncidents } from "../lib/routing/engine.js";
import { haversineM, projectOnSegment } from "../lib/routing/geometry.js";
import { createGraphLoader, RoutingDataError } from "../lib/routing/graphStore.js";
import { createRoutingClient } from "../lib/routing/client.js";
import { createRoutingService } from "../lib/routing/service.js";
import { buildGraph } from "./routing/graphBuilder.mjs";
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
const expectThrows = async (name, run, code) => {
  count += 1;
  try {
    await run();
    failures.push(`${name}\n    expected an error with code ${code}, but nothing was thrown`);
  } catch (error) {
    if (error.code !== code) failures.push(`${name}\n    expected error code ${code}\n    got      ${error.code} (${error.message})`);
  }
};

// ---- 1. a made-up grid ----

//   D(0.002, 0) --North St, one-way east--> E --> F(0.002, 0.004)
//   |                                      /|                |
//   West Av    Diag Path (footway) A-E    Mid Av         East Av
//   |                                      \|                |
//   A(0, 0) ------------ South St ---------- B ------------- C(0, 0.004)
//
// Every block is 0.002 degrees = U metres. Positions are (lat, lon).
const U = (0.002 * Math.PI * 6_371_000) / 180; // 222.39 m
const pos = { A: [0, 0], B: [0, 0.002], C: [0, 0.004], D: [0.002, 0], E: [0.002, 0.002], F: [0.002, 0.004] };
const BBOX = [-0.05, -0.05, 0.05, 0.05];

function gridGraph(roads, positions = pos) {
  const keys = Object.keys(positions);
  const lat = Float64Array.from(keys, (k) => positions[k][0]);
  const lon = Float64Array.from(keys, (k) => positions[k][1]);
  const ways = roads.map(({ nodes, tags }) => ({ nodes: nodes.map((k) => keys.indexOf(k)), ...classifyWay({ highway: "residential", ...tags }) }));
  const { graph } = buildGraph({ bbox: BBOX, lat, lon, ways });
  return decodeGraph(encodeGraph(graph));
}
const makeRouter = (roads, positions) => createRouter(gridGraph(roads, positions));

const GRID_ROADS = [
  { nodes: ["A", "B", "C"], tags: { name: "South St" } },
  { nodes: ["D", "E", "F"], tags: { name: "North St", oneway: "yes" } },
  { nodes: ["A", "D"], tags: { name: "West Av" } },
  { nodes: ["B", "E"], tags: { name: "Mid Av" } },
  { nodes: ["C", "F"], tags: { name: "East Av" } },
  { nodes: ["A", "E"], tags: { highway: "footway", name: "Diag Path" } },
];
const grid = makeRouter(GRID_ROADS);
const at = (key) => ({ lat: pos[key][0], lon: pos[key][1] });
const here = (lat, lon) => ({ lat, lon });
const go = (router, from, to, profile, extra = {}) => router.route({ from, to, profile, metric: "distance", ...extra });
const names = (result) => result.legs.map((leg) => leg.name);

check("grid: 6 junctions and 8 roads were built", [grid.stats.nodes, grid.stats.edges], [6, 8]);

{
  const r = go(grid, at("D"), at("F"), "drive");
  check("drive D to F: along North St, two blocks", [r.status, names(r)], ["ok", ["North St", "North St"]]);
  near("drive D to F: distance", r.distanceM, 2 * U, 0.3);
  check("drive D to F: the line has 3 points", r.coordinates.length, 3);
}
{
  const r = go(grid, at("F"), at("D"), "drive");
  near("drive F to D: North St is one-way, so back round three sides (East, South, West)", r.distanceM, 4 * U, 0.4);
  check("drive F to D: the roads used", names(r), ["East Av", "South St", "South St", "West Av"]);
}
{
  const r = go(grid, at("F"), at("D"), "walk");
  near("walk F to D: one-ways are ignored, straight back along North St", r.distanceM, 2 * U, 0.3);
}
{
  const walk = go(grid, at("A"), at("E"), "walk");
  near("walk A to E: takes the footpath diagonal", walk.distanceM, Math.SQRT2 * U, 0.4);
  check("walk A to E: the road used", names(walk), ["Diag Path"]);
  const drive = go(grid, at("A"), at("E"), "drive");
  near("drive A to E: cars cannot use the footpath, two blocks round", drive.distanceM, 2 * U, 0.4);
  check("drive A to E: not on the footpath", names(drive).includes("Diag Path"), false);
}
{
  // Start and end in the middle of roads: 0.0001 degrees (11.12 m) off the road.
  const r = go(grid, here(0.0001, 0.001), here(0.0001, 0.003), "drive");
  near("mid-road to mid-road: half a block + half a block", r.distanceM, U, 0.3);
  near("mid-road: the start is 11.12 m from the road", r.from.snapDistanceM, 11.12, 0.1);
  near("mid-road: the end is 11.12 m from the road", r.to.snapDistanceM, 11.12, 0.1);
  check("mid-road: south street twice", names(r), ["South St", "South St"]);
}
{
  const a = here(0, 0.0005);
  const b = here(0, 0.0015);
  near("same road, forwards", go(grid, a, b, "drive").distanceM, U / 2, 0.2);
  const back = go(grid, b, a, "drive");
  near("same two-way road, backwards", back.distanceM, U / 2, 0.2);
  check("same road: one leg", back.legs.length, 1);
}
{
  // On the one-way North St going the wrong way: forward to E, then back round to D and on.
  const r = go(grid, here(0.002, 0.0015), here(0.002, 0.0005), "drive");
  near("same one-way road, against the direction: on to E (a quarter block), round B, A, D (three blocks), back along North St (a quarter block)", r.distanceM, 3.5 * U, 0.5);
  const walk = go(grid, here(0.002, 0.0015), here(0.002, 0.0005), "walk");
  near("same one-way road, on foot: straight back", walk.distanceM, U / 2, 0.2);
}
{
  // Snap limit: 300 m.
  const edge = go(grid, here(0.002 + 0.00225, 0.001), at("F"), "walk");
  check("250 m from the nearest road still snaps", edge.status, "ok");
  near("... and says how far it was", edge.from.snapDistanceM, 250.2, 0.5);
  const far = go(grid, here(0.002 + 0.0028, 0.001), at("F"), "walk");
  check("311 m from the nearest road is outside coverage (start)", [far.status, far.where], ["outside-coverage", "start"]);
  const lostEnd = go(grid, at("A"), here(0.05, 0.05), "walk");
  check("... the end", [lostEnd.status, lostEnd.where], ["outside-coverage", "end"]);
  check("... both", go(grid, here(0.03, 0.03), here(0.05, 0.05), "walk").where, "both");
  check("... and the limit is reported", far.snapLimitM, 300);
}
{
  // Time cost and the estimate: walking 4.8 km/h, driving a residential road 25 km/h.
  const walk = grid.route({ from: at("D"), to: at("F"), profile: "walk" });
  near("walk time estimate = distance / 4.8 km/h", walk.durationS, (2 * U) / (4.8 / 3.6), 0.3);
  near("walk: cost is the time when there is no zone", walk.cost, walk.durationS, 0.001);
  const drive = grid.route({ from: at("D"), to: at("F"), profile: "drive" });
  near("drive time estimate = distance / 25 km/h", drive.durationS, (2 * U) / (25 / 3.6), 0.2);
  near("speeds: residential car", speedMps("drive", "residential"), 25 / 3.6, 1e-9);
  check("speeds: steps on foot are slower than a road", speedMps("walk", "steps") < speedMps("walk", "residential"), true);
}

// Avoid zones.
{
  const zone = (id, key) => ({ id, lat: pos[key][0], lon: pos[key][1], radiusM: 200 });
  const atE = [zone("E", "E")];
  const around = go(grid, at("D"), at("F"), "walk", { zones: atE });
  near("zone at E: walking D to F goes round the south side instead (4 blocks)", around.distanceM, 4 * U, 0.4);
  check("zone at E: the route does not cross it", around.crossedZones, []);

  const both = [zone("E", "E"), zone("B", "B")];
  const through = grid.route({ from: at("D"), to: at("F"), profile: "walk", zones: both });
  check("zones at E and B: every way is penalised; the cheaper (through E) is used, not blocked", through.status, "ok");
  near("... two blocks via North St", through.distanceM, 2 * U, 0.3);
  check("... and it says it still crosses the zone at E only", through.crossedZones.map((z) => z.id), ["E"]);
  near("... the cost is 10x on the penalised roads", through.cost, 10 * through.durationS, 0.01);
  near("... the time shown is the real time, without the penalty", through.durationS, (2 * U) / (4.8 / 3.6), 0.3);
  check("... both legs are marked as inside a zone", through.legs.map((l) => l.inAvoidZone), [true, true]);

  // A road with no alternative: the zone costs 10x but cannot block it.
  const line = makeRouter(
    [{ nodes: ["P", "Q", "R"], tags: { name: "Line St" } }],
    { P: [0, 0], Q: [0, 0.002], R: [0, 0.004] },
  );
  const crossing = line.route({ from: { lat: 0, lon: 0 }, to: { lat: 0, lon: 0.004 }, profile: "drive", zones: [{ id: "Q", lat: 0, lon: 0.002, radiusM: 200 }] });
  check("a zone on the only road: still routed", crossing.status, "ok");
  check("... and reported", crossing.crossedZones.map((z) => z.id), ["Q"]);
  near("... at 10x the cost", crossing.cost / crossing.durationS, 10, 0.001);
  const clear = line.route({ from: { lat: 0, lon: 0 }, to: { lat: 0, lon: 0.004 }, profile: "drive", zones: [{ id: "far", lat: 0.01, lon: 0.01, radiusM: 200 }] });
  check("a zone that touches nothing changes nothing", clear.crossedZones, []);
  near("... and costs nothing extra", clear.cost, clear.durationS, 1e-6);
  const none = grid.route({ from: at("D"), to: at("F"), profile: "walk", zones: [] });
  check("no zones: no crossings", none.crossedZones, []);
}

// Which incidents make avoid zones.
{
  const incident = (extra) => ({ _id: "i", type: "flood", severity: "high", status: "reported", location: { type: "Point", coordinates: [76.78, 30.73] }, ...extra });
  check("flood, high, reported: a zone", zonesFromIncidents([incident({})]), [{ id: "i", type: "flood", severity: "high", lat: 30.73, lon: 76.78, radiusM: 200 }]);
  check("fire, critical, in progress: a zone", zonesFromIncidents([incident({ type: "fire", severity: "critical", status: "in_progress" })]).length, 1);
  check("earthquake, high: a zone", zonesFromIncidents([incident({ type: "earthquake" })]).length, 1);
  check("medical: none", zonesFromIncidents([incident({ type: "medical" })]).length, 0);
  check("other: none", zonesFromIncidents([incident({ type: "other", severity: "critical" })]).length, 0);
  check("flood, medium: none", zonesFromIncidents([incident({ severity: "medium" })]).length, 0);
  check("flood, low: none", zonesFromIncidents([incident({ severity: "low" })]).length, 0);
  check("resolved: none", zonesFromIncidents([incident({ status: "resolved" })]).length, 0);
  check("no location: ignored", zonesFromIncidents([incident({ location: undefined }), incident({ location: { coordinates: ["x", 1] } })]).length, 0);
  check("not a list: no zones", [zonesFromIncidents(null), zonesFromIncidents(undefined)], [[], []]);
  check("the radius can be changed", zonesFromIncidents([incident({})], 350)[0].radiusM, 350);
}

// The cheapest of several places.
{
  const service = createRoutingService({
    loader: { load: async () => ({ graph: gridGraph(GRID_ROADS), meta: { builtAt: "test" }, source: "test" }) },
  });
  // Driving from F (top right). North St is one-way east, so it cannot be used to come back.
  const candidates = [
    { id: "X", lat: 0.002, lon: 0.002 }, // E: 1 block away in a straight line, but 3 by road (East, South, Mid)
    { id: "Y", lat: 0, lon: 0.002 }, // B: 1.41 blocks away, 2 by road (East, South)
    { id: "Z", lat: 0.002, lon: 0 }, // D: 2 blocks away, 4 by road (East, South, South, West)
    { id: "W", lat: 0, lon: 0 }, // A: 2.24 blocks away, 3 by road: the 4th nearest, never tried
  ];
  const result = await service.routeToNearest({ from: at("F"), candidates, profile: "drive" });
  check("nearest of three: status", result.status, "ok");
  check("nearest of three: the nearest by line (X) is not the cheapest by road; Y is", result.best.candidate.id, "Y");
  check("nearest of three: only the 3 nearest by line were routed", result.tried.map((t) => t.id), ["X", "Y", "Z"]);
  near("nearest of three: X is three blocks by road", result.tried[0].distanceM, 3 * U, 0.4);
  near("nearest of three: Y is two", result.tried[1].distanceM, 2 * U, 0.3);
  near("nearest of three: Z is four", result.tried[2].distanceM, 4 * U, 0.4);
  const one = await service.routeToNearest({ from: at("F"), candidates, profile: "drive", limit: 1 });
  check("limit 1: only the nearest by line is tried", [one.tried.length, one.best.candidate.id], [1, "X"]);
  const lost = await service.routeToNearest({ from: here(0.03, 0.03), candidates, profile: "drive" });
  check("start outside coverage", [lost.status, lost.where], ["outside-coverage", "start"]);
  const empty = await service.routeToNearest({ from: at("F"), candidates: [], profile: "drive" });
  check("no candidates: no route", empty.status, "no-route");
  const outsideEnd = await service.routeToNearest({ from: at("F"), candidates: [{ id: "far", lat: 0.04, lon: 0.04 }], profile: "walk" });
  check("every place outside coverage", [outsideEnd.status, outsideEnd.where], ["outside-coverage", "end"]);
  // On foot North St's one-way does not matter, so X (one block) is cheapest ...
  const walking = await service.routeToNearest({ from: at("F"), candidates, profile: "walk" });
  check("on foot: X, one block along North St", [walking.best.candidate.id, Math.round(walking.best.route.distanceM)], ["X", Math.round(U)]);
  // ... until a flood zone sits on E: X is inside it (10x), so Y, two clean blocks, wins.
  const zoned = await service.routeToNearest({ from: at("F"), candidates, profile: "walk", zones: [{ id: "flood", lat: 0.002, lon: 0.002, radiusM: 100 }] });
  check("on foot with a zone on X: Y is now cheapest", zoned.best.candidate.id, "Y");
  check("... by a route that avoids the zone", zoned.best.route.crossedZones, []);
  check("... and X is still listed as costing a zone crossing", zoned.tried[0].crossedZones, 1);
}

// ---- 2. the heap ----

{
  const heap = new MinHeap(4);
  let seed = 12345;
  const random = () => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    return seed / 2_147_483_648;
  };
  const values = Array.from({ length: 5000 }, random);
  values.forEach((v, i) => heap.push(v, i, v * 2));
  check("heap: size after growing past its first capacity", heap.size, 5000);
  const out = [];
  let costsMatch = true;
  while (heap.size > 0) {
    out.push(heap.peekKey());
    heap.pop();
    if (heap.popCost !== out[out.length - 1] * 2 || values[heap.popNode] !== out[out.length - 1]) costsMatch = false;
  }
  check("heap: pops in ascending order", out.every((v, i) => i === 0 || out[i - 1] <= v), true);
  check("heap: each entry keeps its own node and cost", costsMatch, true);
  heap.push(3, 1, 0);
  heap.clear();
  check("heap: clear empties it", heap.size, 0);
}

// ---- 3. saving the graph on the device ----

const graphPath = path.join(appRoot, "public", "routing", "tricity-roads.bin.gz");
const metaPath = path.join(appRoot, "public", "routing", "meta.json");
const haveRealData = fs.existsSync(graphPath) && fs.existsSync(metaPath);
let realMeta = null;
let realBytes = null;
if (haveRealData) {
  realMeta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  realBytes = fs.readFileSync(graphPath);
  const bufferOf = (bytes) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

  // A pretend network that serves the real files, can be switched off, and counts requests.
  const network = (files) => {
    const state = { online: true, requests: [], files };
    state.fetch = async (url) => {
      state.requests.push(url);
      if (!state.online) throw new TypeError("Failed to fetch");
      const body = state.files[url];
      if (body === undefined) return { ok: false, status: 404 };
      return {
        ok: true,
        status: 200,
        json: async () => JSON.parse(body),
        arrayBuffer: async () => bufferOf(body),
      };
    };
    return state;
  };
  const memoryStore = (initial) => {
    let record = initial;
    return { get: async () => record, put: async (r) => (record = r), clear: async () => (record = undefined), peek: () => record };
  };

  {
    const net = network({ "/routing/meta.json": JSON.stringify(realMeta), [`/routing/${realMeta.file}`]: realBytes });
    const store = memoryStore();
    const loader = createGraphLoader({ fetchImpl: net.fetch, store });
    const first = await loader.load();
    check("loader: first load downloads", first.source, "downloaded");
    check("loader: it asked for the meta file and the graph", net.requests, ["/routing/meta.json", `/routing/${realMeta.file}`]);
    check("loader: the graph is saved with its checksum", store.peek().sha256, realMeta.sha256);
    check("loader: and it reads", first.graph.edgeA.length, realMeta.counts.edges);

    net.requests.length = 0;
    const second = await loader.load();
    check("loader: second load, same checksum: uses the saved copy, downloads nothing", [second.source, net.requests], ["saved", ["/routing/meta.json"]]);

    net.online = false;
    net.requests.length = 0;
    const offline = await loader.load();
    check("loader: offline: the saved copy is used", [offline.source, offline.graph.edgeA.length], ["saved", realMeta.counts.edges]);
    check("loader: offline: the saved copy's build date is still known", offline.meta.builtAt, realMeta.builtAt);
  }
  {
    const net = network({});
    net.online = false;
    const loader = createGraphLoader({ fetchImpl: net.fetch, store: memoryStore() });
    await expectThrows("loader: offline with nothing saved says the road data is missing", () => loader.load(), "graph-missing");
    check("loader: ensureSaved reports false then", await loader.ensureSaved(), false);
  }
  {
    const net = network({ "/routing/meta.json": JSON.stringify({ ...realMeta, sha256: "new-checksum" }), [`/routing/${realMeta.file}`]: realBytes });
    const store = memoryStore({ sha256: realMeta.sha256, builtAt: "old", bytes: bufferOf(realBytes) });
    const result = await createGraphLoader({ fetchImpl: net.fetch, store }).load();
    check("loader: a new checksum on the server replaces the saved copy", [result.source, store.peek().sha256], ["downloaded", "new-checksum"]);
  }
  {
    const net = network({ "/routing/meta.json": JSON.stringify(realMeta), [`/routing/${realMeta.file}`]: realBytes.subarray(0, 5000) });
    const store = memoryStore();
    await expectThrows("loader: a download cut short is refused", () => createGraphLoader({ fetchImpl: net.fetch, store }).load(), "graph-corrupt");
    check("loader: and not saved", store.peek(), undefined);
  }
  {
    const net = network({ "/routing/meta.json": JSON.stringify(realMeta) }); // meta there, graph file 404
    const store = memoryStore({ sha256: "older", builtAt: "older", bytes: bufferOf(realBytes) });
    const result = await createGraphLoader({ fetchImpl: net.fetch, store }).load();
    check("loader: graph file unreachable but an older copy is saved: use it", result.source, "saved");
    const bare = createGraphLoader({ fetchImpl: net.fetch, store: memoryStore() });
    await expectThrows("loader: meta there, graph file not, nothing saved", () => bare.load(), "graph-missing");
  }
  {
    const net = network({ "/routing/meta.json": JSON.stringify(realMeta) });
    net.online = false;
    const store = memoryStore({ sha256: realMeta.sha256, builtAt: "x", bytes: new Uint8Array([1, 2, 3, 4]).buffer });
    await expectThrows("loader: a saved copy that does not read is reported", () => createGraphLoader({ fetchImpl: net.fetch, store }).load(), "graph-corrupt");
    check("loader: and is thrown away so the next try downloads again", store.peek(), undefined);
  }
  {
    const net = network({ "/routing/meta.json": JSON.stringify(realMeta), [`/routing/${realMeta.file}`]: realBytes });
    const store = memoryStore();
    check("loader: ensureSaved downloads and saves", [await createGraphLoader({ fetchImpl: net.fetch, store }).ensureSaved(), store.peek().sha256], [true, realMeta.sha256]);
    check("loader: RoutingDataError is an Error with a code", [new RoutingDataError("graph-missing", "x") instanceof Error, new RoutingDataError("graph-missing", "x").code], [true, "graph-missing"]);
  }
}

// ---- 4. the service and the client ----

{
  let loads = 0;
  let failNext = true;
  const service = createRoutingService({
    loader: {
      load: async () => {
        loads += 1;
        if (failNext) {
          failNext = false;
          throw new RoutingDataError("graph-missing", "no data");
        }
        const keys = Object.keys(pos);
        const { graph } = buildGraph({
          bbox: BBOX,
          lat: Float64Array.from(keys, (k) => pos[k][0]),
          lon: Float64Array.from(keys, (k) => pos[k][1]),
          ways: [{ nodes: [0, 1, 2], ...classifyWay({ highway: "residential", name: "South St" }) }],
        });
        return { graph: decodeGraph(encodeGraph(graph)), meta: { builtAt: "2026-01-01" }, source: "test" };
      },
      ensureSaved: async () => true,
    },
  });
  await expectThrows("service: a failed load is reported", () => service.init(), "graph-missing");
  const info = await service.init();
  check("service: and retried next time", [loads, info.source, info.builtAt, info.stats.edges], [2, "test", "2026-01-01", 1]);
  await service.init();
  await service.route({ from: at("A"), to: at("C"), profile: "walk" });
  check("service: loaded once after that", loads, 2);
  check("service: warm passes through", await service.warm(), true);

  // The client, with a pretend worker that answers like routing.worker.js does.
  const pretendWorker = () => {
    const worker = {
      terminated: false,
      postMessage(message) {
        setTimeout(async () => {
          try {
            worker.onmessage({ data: { id: message.id, ok: true, result: await service[message.method](message.params) } });
          } catch (error) {
            worker.onmessage({ data: { id: message.id, ok: false, error: { code: error.code ?? "failed", message: error.message } } });
          }
        }, 0);
      },
      terminate() {
        worker.terminated = true;
      },
    };
    return worker;
  };
  const viaWorker = createRoutingClient({ makeWorker: pretendWorker });
  const routed = await viaWorker.route({ from: at("A"), to: at("C"), profile: "walk", metric: "distance" });
  check("client: a route through the worker", [routed.status, Math.round(routed.distanceM)], ["ok", Math.round(2 * U)]);
  check("client: it says it used the worker", viaWorker.mode, "worker");
  viaWorker.dispose();

  const failing = createRoutingClient({
    makeWorker: () => {
      throw new Error("Workers are blocked");
    },
    makeService: async () => service,
  });
  const fallback = await failing.route({ from: at("A"), to: at("C"), profile: "walk", metric: "distance" });
  check("client: when the worker cannot start, the same service runs on the main thread", [fallback.status, failing.mode], ["ok", "main"]);

  let crashing = null;
  const crashes = createRoutingClient({
    makeWorker: () => {
      crashing = { postMessage() {}, terminate() {} };
      return crashing;
    },
    makeService: async () => service,
  });
  const waiting = crashes.route({ from: at("A"), to: at("C"), profile: "walk", metric: "distance" });
  crashing.onerror(new Error("script failed to load"));
  const rescued = await waiting;
  check("client: a worker that crashes mid-request: the request is answered on the main thread", [rescued.status, crashes.mode], ["ok", "main"]);
}

// ---- 5. the real road graph ----

const timings = { route: [] };
const realReport = [];
if (haveRealData) {
  const PLACES = {
    s17: [30.7398, 76.7827],
    pgi: [30.7646, 76.7757],
    mohali7: [30.7119, 76.72],
    zirakpur: [30.6417, 76.818],
    panchkula5: [30.6942, 76.8606],
    sukhna: [30.7421, 76.8188],
    rockGarden: [30.7525, 76.8101],
    station: [30.694, 76.8203],
    airport: [30.6735, 76.7885],
    pca: [30.6906, 76.7377],
    elante: [30.7058, 76.801],
    isbt43: [30.7217, 76.7464],
    pinjore: [30.7972, 76.9136],
    kharar: [30.7459, 76.6463],
    deraBassi: [30.5883, 76.8444],
  };
  const P = (key) => ({ lat: PLACES[key][0], lon: PLACES[key][1] });

  let started = performance.now();
  const graph = await decodeGraphFile(realBytes);
  timings.decodeMs = performance.now() - started;
  started = performance.now();
  const router = createRouter(graph);
  timings.indexMs = performance.now() - started;

  // Distances worked out by the independent Dijkstra in scripts/check-routing.mjs (km).
  // Both snap to the roads a little differently, hence the 0.3 km tolerance.
  const REFERENCE = [
    ["s17", "pgi", "walk", 3.68],
    ["s17", "pgi", "drive", 3.72],
    ["s17", "mohali7", "walk", 7.73],
    ["s17", "mohali7", "drive", 7.89],
    ["s17", "zirakpur", "walk", 13.72],
    ["s17", "zirakpur", "drive", 13.81],
    ["s17", "panchkula5", "walk", 10.97],
    ["s17", "panchkula5", "drive", 10.76],
  ];
  for (const [from, to, profile, km] of REFERENCE) {
    const r = router.route({ from: P(from), to: P(to), profile, metric: "distance" });
    near(`real: ${from} to ${to} on a ${profile} route is about ${km} km`, r.distanceM / 1000, km, 0.3);
  }

  const PAIRS = [
    ["s17", "pgi"], ["s17", "mohali7"], ["s17", "zirakpur"], ["s17", "panchkula5"], ["rockGarden", "pgi"], ["elante", "pca"],
    ["mohali7", "zirakpur"], ["panchkula5", "zirakpur"], ["pinjore", "s17"], ["kharar", "mohali7"], ["deraBassi", "zirakpur"],
  ];
  for (const profile of ["walk", "drive"]) {
    for (const metric of ["time", "distance"]) {
      for (const [from, to] of PAIRS) {
        const label = `${from}->${to} ${profile}/${metric}`;
        started = performance.now();
        const fast = router.route({ from: P(from), to: P(to), profile, metric });
        const elapsed = performance.now() - started;
        const slow = router.route({ from: P(from), to: P(to), profile, metric, heuristic: false });
        check(`real: ${label} found a route`, [fast.status, slow.status], ["ok", "ok"]);
        near(`real: ${label}: A* costs the same as plain Dijkstra`, fast.cost, slow.cost, 1e-6);
        check(`real: ${label}: A* looks at no more places than Dijkstra`, fast.expanded <= slow.expanded, true);
        const line = haversineM(fast.from.lat, fast.from.lon, fast.to.lat, fast.to.lon);
        const ratio = fast.distanceM / line;
        check(`real: ${label}: road distance is 1.0 to 2.0 times the straight line (${ratio.toFixed(2)})`, ratio >= 0.999 && ratio <= 2.0, true);
        check(`real: ${label}: the line starts and ends at the snapped points`, [fast.coordinates[0][1].toFixed(6), fast.coordinates[fast.coordinates.length - 1][1].toFixed(6)], [fast.from.lat.toFixed(6), fast.to.lat.toFixed(6)]);
        let drawn = 0;
        for (let i = 1; i < fast.coordinates.length; i += 1) drawn += haversineM(fast.coordinates[i - 1][1], fast.coordinates[i - 1][0], fast.coordinates[i][1], fast.coordinates[i][0]);
        near(`real: ${label}: the drawn line is as long as the reported distance`, drawn, fast.distanceM, Math.max(2, fast.distanceM * 0.002));
        near(`real: ${label}: the legs add up to the distance`, fast.legs.reduce((s, l) => s + l.distanceM, 0), fast.distanceM, 1e-6);
        if (metric === "time") {
          timings.route.push(elapsed);
          realReport.push({ label, km: fast.distanceM / 1000, minutes: fast.durationS / 60, expanded: fast.expanded, dijkstra: slow.expanded, ms: elapsed, legs: fast.legs.length });
        }
      }
    }
  }
  const fastWalk = router.route({ from: P("s17"), to: P("pgi"), profile: "walk" });
  const sameTwice = router.route({ from: P("s17"), to: P("pgi"), profile: "walk" });
  check("real: the same question gives the same answer", [fastWalk.cost, fastWalk.coordinates.length], [sameTwice.cost, sameTwice.coordinates.length]);

  for (const [from, to, where] of [["station", "airport", "end"], ["sukhna", "isbt43", "start"]]) {
    for (const profile of ["walk", "drive"]) {
      const r = router.route({ from: P(from), to: P(to), profile });
      check(`real: ${from} to ${to} (${profile}) is refused as outside coverage (${where})`, [r.status, r.where], ["outside-coverage", where]);
    }
  }
  check("real: a point far outside the area", router.route({ from: { lat: 28.6, lon: 77.2 }, to: P("s17"), profile: "walk" }).where, "start");

  // A zone dropped on the middle of a real route.
  {
    const base = router.route({ from: P("s17"), to: P("pgi"), profile: "walk" });
    const mid = base.coordinates[Math.floor(base.coordinates.length / 2)];
    const zone = { id: "test-flood", type: "flood", severity: "high", lat: mid[1], lon: mid[0], radiusM: 200 };
    const detour = router.route({ from: P("s17"), to: P("pgi"), profile: "walk", zones: [zone] });
    check("real zone: still a route", detour.status, "ok");
    check("real zone: costs at least as much as without", detour.cost >= base.cost - 1e-6, true);
    let closest = Infinity;
    for (let i = 1; i < detour.coordinates.length; i += 1) {
      const [lo1, la1] = detour.coordinates[i - 1];
      const [lo2, la2] = detour.coordinates[i];
      closest = Math.min(closest, projectOnSegment(zone.lat, zone.lon, la1, lo1, la2, lo2).distanceM);
    }
    check("real zone: either it keeps 200 m clear of the zone, or it says it crosses it", closest >= 199 || detour.crossedZones.length === 1, true);
    check("real zone: the unchanged route is reported as crossing", base.crossedZones, []);
    const over = router.route({ from: P("s17"), to: P("pgi"), profile: "walk", zones: [{ ...zone, lat: base.from.lat, lon: base.from.lon }] });
    check("real zone: a zone on the start point cannot be avoided, and is reported", over.crossedZones.map((z) => z.id), ["test-flood"]);
  }

  // The service on real data, from the bytes on disk.
  {
    const net = async (url) => {
      if (url.endsWith("meta.json")) return { ok: true, json: async () => realMeta };
      return { ok: true, arrayBuffer: async () => realBytes.buffer.slice(realBytes.byteOffset, realBytes.byteOffset + realBytes.byteLength) };
    };
    const store = { value: undefined, get: async () => store.value, put: async (v) => (store.value = v), clear: async () => (store.value = undefined) };
    const service = createRoutingService({ loader: createGraphLoader({ fetchImpl: net, store }) });
    const info = await service.init();
    check("real service: loaded from the (pretend) network", [info.source, info.builtAt, info.stats.edges], ["downloaded", realMeta.builtAt, realMeta.counts.edges]);
    const shelters = [
      { id: "near-pgi", lat: 30.7625, lon: 76.7765 },
      { id: "sector-22", lat: 30.7333, lon: 76.7794 },
      { id: "phase-7", lat: 30.7119, lon: 76.72 },
      { id: "pinjore", lat: 30.7972, lon: 76.9136 },
    ];
    const t0 = performance.now();
    const best = await service.routeToNearest({ from: P("s17"), candidates: shelters, profile: "walk" });
    timings.nearestMs = performance.now() - t0;
    check("real service: nearest of three", [best.status, best.tried.length], ["ok", 3]);
    check("real service: picked the lowest cost of those tried", best.best.route.cost, Math.min(...best.tried.filter((t) => t.cost !== null).map((t) => t.cost)));
    check("real service: the 4th (Pinjore) was not tried", best.tried.map((t) => t.id).includes("pinjore"), false);
  }
}

// ---- results ----

if (haveRealData) {
  console.log("Real road graph, in Node (a phone will be several times slower)");
  console.log(`  decode ${timings.decodeMs.toFixed(0)} ms, build router (grid + segments) ${timings.indexMs.toFixed(0)} ms`);
  const sorted = [...timings.route].sort((a, b) => a - b);
  const pctile = (p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
  console.log(`  ${sorted.length} routes (${PAIRS_LABEL()}): median ${pctile(50).toFixed(1)} ms, p90 ${pctile(90).toFixed(1)} ms, max ${sorted[sorted.length - 1].toFixed(1)} ms`);
  console.log(`  nearest of three (3 routes) ${timings.nearestMs.toFixed(1)} ms`);
  console.log("");
  console.log("  route                                   km    min   looked at (A* / Dijkstra)   ms   legs");
  for (const row of realReport) {
    console.log(`  ${row.label.padEnd(36)} ${row.km.toFixed(1).padStart(5)} ${row.minutes.toFixed(0).padStart(6)}   ${String(row.expanded).padStart(6)} / ${String(row.dijkstra).padEnd(6)}   ${row.ms.toFixed(1).padStart(6)} ${String(row.legs).padStart(5)}`);
  }
  check("speed: the median route takes under 100 ms", pctile(50) < 100, true);
  check("speed: the slowest route takes under 1 second", sorted[sorted.length - 1] < 1000, true);
  check("speed: reading the graph and building the router takes under 5 seconds", timings.decodeMs + timings.indexMs < 5000, true);
  console.log("");
} else {
  console.log("Real road graph: not built (npm run routing:build); part 5 skipped.\n");
}
function PAIRS_LABEL() {
  return "11 place pairs, walk and drive";
}

if (failures.length > 0) {
  console.error(`${failures.length} of ${count} checks FAILED:\n`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`All ${count} routing engine checks passed.`);
