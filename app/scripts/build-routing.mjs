// npm run routing:build
//
// Builds the offline road graph the app routes on, from OpenStreetMap data:
//   app/public/routing/tricity-roads.rnrg   the graph (format: lib/routing/format.js)
//   app/public/routing/meta.json              build date, counts, bbox, coverage, checksum
//
// This is the ONLY step in the project that uses the internet, and only once:
// the OpenStreetMap extract is downloaded and kept in a cache folder outside the
// repo (default ~/dev/osm-cache), and later runs reuse it. The app itself never
// touches the internet; it reads the finished file.
//
// Source: the Geofabrik extract "northern-zone" for India (about 220 MB), a
// weekly-to-daily snapshot of OpenStreetMap that Geofabrik publishes for bulk use.
// No API key. The public Overpass API was tried first and refuses automated
// queries ("intended for browser-based and human-operated tools"), so it is not used.
//
//   npm run routing:build                       download once if needed, then build
//   npm run routing:build -- --pbf some.osm.pbf use a file you already have
//   npm run routing:build -- --no-download      fail instead of downloading
//   npm run routing:build -- --cache-dir DIR    where the extract is kept
//
// The data is (c) OpenStreetMap contributors, licensed under the ODbL
// (https://www.openstreetmap.org/copyright). The app shows that credit on the Map
// and About pages.

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { encodeGraph, FLAG_DRIVE, FLAG_WALK } from "../lib/routing/format.js";
import { haversineM } from "../lib/routing/geometry.js";
import { buildGraph } from "./routing/graphBuilder.mjs";
import { classifyWay } from "./routing/highwayRules.mjs";
import { readHighwayWays, readNodes } from "./routing/pbfReader.mjs";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(appRoot, "public", "routing");
// The file is stored as it is, not gzipped, and its name must NOT end in ".gz": the Android
// build (Gradle's asset packaging) decompresses any ".gz" asset and drops the extension, so
// the app inside the APK would find no file of that name. Gzip would only save 0.4 MB and
// needs DecompressionStream, which old Android WebViews lack. ("rnrg" is the format's magic
// number; see lib/routing/format.js.)
const GRAPH_NAME = "tricity-roads.rnrg";

// west, south, east, north: the same box as the offline map (docs/OFFLINE_MAP.md).
const BBOX = [76.6, 30.55, 76.95, 30.85];
const SOURCE_URL = "https://download.geofabrik.de/asia/india/northern-zone-latest.osm.pbf";
const USER_AGENT = "RescueNet-routing-build/1.0 (student project; one-time road extract for an offline app)";

// ---- arguments ----

function parseArgs(argv) {
  const args = { pbf: null, cacheDir: process.env.RESCUENET_OSM_CACHE || path.join(os.homedir(), "dev", "osm-cache"), download: true };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--pbf") args.pbf = argv[++i];
    else if (arg === "--cache-dir") args.cacheDir = argv[++i];
    else if (arg === "--no-download") args.download = false;
    else throw new Error(`Unknown option ${arg}`);
  }
  return args;
}

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;
const seconds = (since) => `${((Date.now() - since) / 1000).toFixed(1)} s`;

// ---- the one-time download ----

async function download(url, target) {
  console.log(`Downloading ${url}`);
  console.log("This is the one-time internet use; later runs reuse the saved file.");
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!response.ok || !response.body) throw new Error(`Download failed: HTTP ${response.status}`);
  const total = Number(response.headers.get("content-length")) || 0;
  const lastModified = response.headers.get("last-modified") || "";
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const partial = `${target}.part`;
  let received = 0;
  let lastPrint = 0;
  const source = Readable.fromWeb(response.body);
  source.on("data", (chunk) => {
    received += chunk.length;
    if (Date.now() - lastPrint > 2000) {
      lastPrint = Date.now();
      process.stdout.write(`\r  ${mb(received)}${total ? ` of ${mb(total)}` : ""}   `);
    }
  });
  await pipeline(source, fs.createWriteStream(partial));
  process.stdout.write(`\r  ${mb(received)} downloaded.            \n`);
  if (total && received !== total) throw new Error(`Download is incomplete (${received} of ${total} bytes).`);

  // Geofabrik publishes an MD5 next to each file; check it when it is there.
  let expectedMd5 = "";
  try {
    const md5Response = await fetch(`${response.url}.md5`, { headers: { "user-agent": USER_AGENT } });
    if (md5Response.ok) expectedMd5 = (await md5Response.text()).trim().split(/\s+/)[0];
  } catch {
    // no checksum available: say so below
  }
  const actualMd5 = crypto.createHash("md5").update(fs.readFileSync(partial)).digest("hex");
  if (expectedMd5 && expectedMd5 !== actualMd5) {
    fs.rmSync(partial);
    throw new Error(`Checksum mismatch (expected ${expectedMd5}, got ${actualMd5}). The download was removed.`);
  }
  console.log(expectedMd5 ? `  MD5 ${actualMd5} matches Geofabrik's published checksum.` : `  MD5 ${actualMd5} (no published checksum to compare).`);
  fs.renameSync(partial, target);
  fs.writeFileSync(
    `${target}.info.json`,
    JSON.stringify({ url: response.url, requestedUrl: url, lastModified, md5: actualMd5, md5Verified: Boolean(expectedMd5), downloadedAt: new Date().toISOString() }, null, 2),
  );
}

// ---- reading the extract ----

function grow(array) {
  const bigger = new Float64Array(array.length * 2);
  bigger.set(array);
  return bigger;
}

function readRoads(buffer) {
  const [west, south, east, north] = BBOX;

  let started = Date.now();
  let ids = new Float64Array(1 << 20);
  let latArr = new Float64Array(1 << 20);
  let lonArr = new Float64Array(1 << 20);
  let count = 0;
  readNodes(buffer, BBOX, (id, lat, lon) => {
    if (count === ids.length) {
      ids = grow(ids);
      latArr = grow(latArr);
      lonArr = grow(lonArr);
    }
    ids[count] = id;
    latArr[count] = lat;
    lonArr[count] = lon;
    count += 1;
  });
  ids = ids.slice(0, count);
  const lat = latArr.slice(0, count);
  const lon = lonArr.slice(0, count);
  console.log(`  pass 1: ${count.toLocaleString("en")} nodes inside ${west},${south},${east},${north} (${seconds(started)})`);

  // Node ids ascend in a Geofabrik file, which makes lookups a binary search.
  let sorted = true;
  for (let i = 1; i < count; i += 1) {
    if (ids[i] < ids[i - 1]) {
      sorted = false;
      break;
    }
  }
  if (!sorted) throw new Error("Node ids are not in ascending order in this file; use a standard Geofabrik extract.");
  const find = (id) => {
    let lo = 0;
    let hi = count - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const value = ids[mid];
      if (value === id) return mid;
      if (value < id) lo = mid + 1;
      else hi = mid - 1;
    }
    return -1;
  };

  started = Date.now();
  const ways = [];
  const seenHighways = {};
  let highwayWays = 0;
  let skippedByRule = 0;
  readHighwayWays(buffer, (id, tags, refs) => {
    highwayWays += 1;
    const road = classifyWay(tags);
    if (!road) {
      skippedByRule += 1;
      return;
    }
    // Keep the stretches of the way that lie inside the box.
    let run = [];
    const flush = () => {
      if (run.length >= 2) {
        ways.push({ nodes: run, cls: road.cls, flags: road.flags, oneway: road.oneway, name: road.name });
        seenHighways[tags.highway] = (seenHighways[tags.highway] ?? 0) + 1;
      }
      run = [];
    };
    for (const ref of refs) {
      const index = find(ref);
      if (index >= 0) run.push(index);
      else flush();
    }
    flush();
  });
  console.log(`  pass 2: ${highwayWays.toLocaleString("en")} highway ways in the file, ${skippedByRule.toLocaleString("en")} not routable, ${ways.length.toLocaleString("en")} road pieces inside the box (${seconds(started)})`);
  return { lat, lon, ways, seenHighways };
}

// ---- reports ----

// Share of the box's 0.01-degree cells (about 1 km) that have a road of each mode.
function cellCoverage(graph) {
  const [west, south, east, north] = BBOX;
  const cell = 0.01;
  const columns = Math.ceil((east - west) / cell);
  const rows = Math.ceil((north - south) / cell);
  const walk = new Set();
  const drive = new Set();
  const mark = (set, la, lo) => {
    const column = Math.min(columns - 1, Math.max(0, Math.floor((lo - west) / cell)));
    const row = Math.min(rows - 1, Math.max(0, Math.floor((la - south) / cell)));
    set.add(row * columns + column);
  };
  for (const edge of graph.edges) {
    const points = [[graph.nodeLat[edge.a] / 1e6, graph.nodeLon[edge.a] / 1e6]];
    for (let i = 0; i < edge.shape.length; i += 2) points.push([edge.shape[i] / 1e6, edge.shape[i + 1] / 1e6]);
    points.push([graph.nodeLat[edge.b] / 1e6, graph.nodeLon[edge.b] / 1e6]);
    for (let i = 1; i < points.length; i += 1) {
      const [la1, lo1] = points[i - 1];
      const [la2, lo2] = points[i];
      const steps = Math.max(1, Math.ceil(haversineM(la1, lo1, la2, lo2) / 100));
      for (let s = 0; s <= steps; s += 1) {
        const la = la1 + ((la2 - la1) * s) / steps;
        const lo = lo1 + ((lo2 - lo1) * s) / steps;
        if (edge.flags & FLAG_WALK) mark(walk, la, lo);
        if (edge.flags & FLAG_DRIVE) mark(drive, la, lo);
      }
    }
  }
  return { cells: columns * rows, walkCells: walk.size, driveCells: drive.size };
}

const pct = (part, whole) => (whole === 0 ? "0%" : `${((100 * part) / whole).toFixed(1)}%`);

// ---- main ----

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let pbfPath = args.pbf ? path.resolve(args.pbf) : path.join(args.cacheDir, "northern-zone.osm.pbf");

  if (!fs.existsSync(pbfPath)) {
    if (args.pbf) throw new Error(`File not found: ${pbfPath}`);
    if (!args.download) throw new Error(`No saved OpenStreetMap extract at ${pbfPath}, and --no-download was given.`);
    await download(SOURCE_URL, pbfPath);
  } else {
    console.log(`Using the saved extract ${pbfPath} (${mb(fs.statSync(pbfPath).size)}). No download.`);
  }
  pbfPath = fs.realpathSync(pbfPath);
  const infoPath = `${pbfPath}.info.json`;
  const info = fs.existsSync(infoPath) ? JSON.parse(fs.readFileSync(infoPath, "utf8")) : null;
  const extractDate = info?.lastModified ? new Date(info.lastModified).toISOString() : fs.statSync(pbfPath).mtime.toISOString();

  console.log("\nReading roads…");
  const buffer = fs.readFileSync(pbfPath);
  const { lat, lon, ways, seenHighways } = readRoads(buffer);

  console.log("\nBuilding the graph…");
  const started = Date.now();
  const { graph, stats } = buildGraph({ bbox: BBOX, lat, lon, ways });
  console.log(`  ${stats.ways.toLocaleString("en")} ways -> ${stats.edgesBeforeJoin.toLocaleString("en")} edges -> ${stats.edgesAfterJoin.toLocaleString("en")} after joining chains (${seconds(started)})`);

  const raw = encodeGraph(graph);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, GRAPH_NAME), raw);
  const sha256 = crypto.createHash("sha256").update(raw).digest("hex");

  const cells = cellCoverage(graph);
  const walkEdges = graph.edges.filter((e) => e.flags & FLAG_WALK).length;
  const driveEdges = graph.edges.filter((e) => e.flags & FLAG_DRIVE).length;
  const meta = {
    name: "RescueNet road graph",
    file: GRAPH_NAME,
    format: "RNRG",
    formatVersion: 1,
    builtAt: new Date().toISOString(),
    bbox: BBOX,
    bboxOrder: "west,south,east,north",
    source: {
      name: "OpenStreetMap, Geofabrik extract asia/india/northern-zone",
      url: SOURCE_URL,
      extractDate,
      licence: "ODbL 1.0",
      attribution: "© OpenStreetMap contributors",
    },
    counts: {
      nodes: stats.vertices,
      edges: stats.edges,
      walkEdges,
      driveEdges,
      shapePoints: stats.shapePoints,
      streetNames: stats.names,
    },
    lengthKm: { walk: Number(stats.after.walkKm.toFixed(1)), drive: Number(stats.after.driveKm.toFixed(1)) },
    coverage: {
      note: "Share of the roads found in the box that are in the biggest connected piece and so can be routed on.",
      walkLengthKept: pct(stats.after.walkKm, stats.before.walkKm),
      driveLengthKept: pct(stats.after.driveKm, stats.before.driveKm),
      walkPieces: stats.walk.pieces,
      drivePieces: stats.drive.pieces,
      cells1km: { total: cells.cells, withWalkRoad: cells.walkCells, withDriveRoad: cells.driveCells },
    },
    bytes: { file: raw.length },
    sha256,
  };
  fs.writeFileSync(path.join(outDir, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);

  console.log("\nResult");
  console.log(`  nodes (junctions and road ends): ${stats.vertices.toLocaleString("en")}`);
  console.log(`  edges: ${stats.edges.toLocaleString("en")} (${walkEdges.toLocaleString("en")} walkable, ${driveEdges.toLocaleString("en")} drivable) with ${stats.shapePoints.toLocaleString("en")} shape points`);
  console.log(`  street names: ${stats.names.toLocaleString("en")}`);
  console.log(`  walking: ${stats.after.walkKm.toFixed(0)} km kept of ${stats.before.walkKm.toFixed(0)} km found (${pct(stats.after.walkKm, stats.before.walkKm)}); ${stats.walk.pieces} separate pieces, the biggest holds ${pct(stats.walk.largestVertices, stats.walk.vertices)} of the junctions`);
  console.log(`  driving: ${stats.after.driveKm.toFixed(0)} km kept of ${stats.before.driveKm.toFixed(0)} km found (${pct(stats.after.driveKm, stats.before.driveKm)}); ${stats.drive.pieces} separate pieces, the biggest holds ${pct(stats.drive.largestVertices, stats.drive.vertices)} of the junctions`);
  console.log(`  1 km map cells with a road: walking ${cells.walkCells} of ${cells.cells} (${pct(cells.walkCells, cells.cells)}), driving ${cells.driveCells} of ${cells.cells} (${pct(cells.driveCells, cells.cells)})`);
  console.log(`  road types used: ${Object.entries(seenHighways).sort((p, q) => q[1] - p[1]).map(([name, n]) => `${name} ${n}`).join(", ")}`);
  console.log("\nFiles");
  console.log(`  public/routing/${GRAPH_NAME}  ${mb(raw.length)} (stored uncompressed; gzip would be ${mb(zlib.gzipSync(raw, { level: 9 }).length)})`);
  console.log(`  public/routing/meta.json  ${fs.statSync(path.join(outDir, "meta.json")).size} bytes`);
  console.log("\nNext: npm run check:routing (distance checks on 10 known place pairs).");
}

main().catch((error) => {
  console.error(`\nrouting:build failed: ${error.message}`);
  process.exit(1);
});
