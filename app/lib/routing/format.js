// The road-graph file: how scripts/build-routing.mjs writes it and how the app
// reads it. One format, one module, so the two can never drift apart.
//
// The file is a compact binary, gzipped (public/routing/tricity-roads.bin.gz).
// Layout (all numbers are LEB128 varints unless a width is given; "zigzag" means a
// signed number folded into an unsigned one, so small negatives stay small):
//
//   "RNRG"                      4 bytes, magic
//   version                     1 byte
//   bbox                        west, south, east, north as zigzag micro-degrees
//   nameCount, then each name   varint byte length + UTF-8 bytes (name 0 is "")
//   nodeCount, then each node   zigzag lat, zigzag lon: the first is absolute, the rest are
//                               differences from the previous node (nodes are stored
//                               in Z-order, so neighbours are close and the numbers small)
//   edgeCount, then each edge   a - previous a            (edges are sorted by a)
//                               zigzag (b - a)
//                               length in decimetres
//                               road class (1 byte), flags (1 byte)
//                               name index
//                               number of shape points between a and b
//                               each shape point: zigzag lat, lon difference from the
//                               point before it (the first starts from node a)
//
// Nodes are junctions and road ends. An edge is a stretch of road between two
// nodes with its bends stored as shape points. Coordinates are integers in
// millionths of a degree (about 0.11 m).

export const FORMAT_VERSION = 1;
const MAGIC = [0x52, 0x4e, 0x52, 0x47]; // "RNRG"

// Road classes: the code stored in the file is the index in this list. Link roads
// (motorway_link, ...) are stored as their parent class.
export const ROAD_CLASSES = [
  "motorway",
  "trunk",
  "primary",
  "secondary",
  "tertiary",
  "unclassified",
  "residential",
  "service",
  "living_street",
  "track",
  "path",
  "footway",
  "steps",
  "cycleway",
  "pedestrian",
];
export const CLASS_CODE = Object.fromEntries(ROAD_CLASSES.map((name, code) => [name, code]));

// Edge flags (one byte).
export const FLAG_WALK = 1; // people on foot can use it
export const FLAG_DRIVE = 2; // cars can use it
export const FLAG_ONEWAY = 4; // cars may only go from a to b (walking ignores this)
export const FLAG_ROUNDABOUT = 8; // part of a roundabout

// ---- writing ----

class ByteWriter {
  constructor() {
    this.bytes = new Uint8Array(1 << 20);
    this.length = 0;
  }

  ensure(extra) {
    if (this.length + extra <= this.bytes.length) return;
    let size = this.bytes.length * 2;
    while (size < this.length + extra) size *= 2;
    const bigger = new Uint8Array(size);
    bigger.set(this.bytes.subarray(0, this.length));
    this.bytes = bigger;
  }

  byte(value) {
    this.ensure(1);
    this.bytes[this.length++] = value;
  }

  varint(value) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`varint needs a non-negative integer, got ${value}`);
    this.ensure(10);
    let n = value;
    while (n >= 128) {
      this.bytes[this.length++] = (n % 128) | 128;
      n = Math.floor(n / 128);
    }
    this.bytes[this.length++] = n;
  }

  zigzag(value) {
    if (!Number.isSafeInteger(value)) throw new Error(`zigzag needs an integer, got ${value}`);
    this.varint(value >= 0 ? value * 2 : -value * 2 - 1);
  }

  raw(bytes) {
    this.ensure(bytes.length);
    this.bytes.set(bytes, this.length);
    this.length += bytes.length;
  }

  result() {
    return this.bytes.slice(0, this.length);
  }
}

// graph: {
//   bbox: [west, south, east, north] in degrees,
//   names: string[]  (names[0] must be ""),
//   nodeLat, nodeLon: integer micro-degrees, one per node,
//   edges: [{ a, b, lengthDm, cls, flags, name, shape: [lat, lon, lat, lon, ...] micro-degrees }]
//          sorted by a (ascending); shape holds only the points between the nodes
// }
// Returns the uncompressed bytes.
export function encodeGraph(graph) {
  const { bbox, names, nodeLat, nodeLon, edges } = graph;
  if (names[0] !== "") throw new Error("names[0] must be the empty string");
  const out = new ByteWriter();
  for (const byte of MAGIC) out.byte(byte);
  out.byte(FORMAT_VERSION);
  for (const degrees of bbox) out.zigzag(Math.round(degrees * 1e6));

  const encoder = new TextEncoder();
  out.varint(names.length);
  for (const name of names) {
    const bytes = encoder.encode(name);
    out.varint(bytes.length);
    out.raw(bytes);
  }

  out.varint(nodeLat.length);
  let lat = 0;
  let lon = 0;
  for (let i = 0; i < nodeLat.length; i += 1) {
    out.zigzag(nodeLat[i] - lat);
    out.zigzag(nodeLon[i] - lon);
    lat = nodeLat[i];
    lon = nodeLon[i];
  }

  out.varint(edges.length);
  let previousA = 0;
  for (const edge of edges) {
    if (edge.a < previousA) throw new Error("edges must be sorted by a");
    out.varint(edge.a - previousA);
    previousA = edge.a;
    out.zigzag(edge.b - edge.a);
    out.varint(edge.lengthDm);
    out.byte(edge.cls);
    out.byte(edge.flags);
    out.varint(edge.name);
    const points = edge.shape.length / 2;
    out.varint(points);
    let pLat = nodeLat[edge.a];
    let pLon = nodeLon[edge.a];
    for (let i = 0; i < edge.shape.length; i += 2) {
      out.zigzag(edge.shape[i] - pLat);
      out.zigzag(edge.shape[i + 1] - pLon);
      pLat = edge.shape[i];
      pLon = edge.shape[i + 1];
    }
  }
  return out.result();
}

// ---- reading ----

// Returns the graph as typed arrays (cheap to hold, cheap to index):
//   bbox            [west, south, east, north] in degrees
//   names           string[]
//   nodeLat/nodeLon Int32Array, micro-degrees
//   edgeA/edgeB     Int32Array, node indexes
//   edgeLenDm       Uint32Array, decimetres
//   edgeClass       Uint8Array, an index into ROAD_CLASSES
//   edgeFlags       Uint8Array, FLAG_* bits
//   edgeName        Uint32Array, an index into names
//   shapeStart      Uint32Array (edgeCount + 1): edge i's shape points are
//                   shapeLat/shapeLon[shapeStart[i] .. shapeStart[i + 1])
//   shapeLat/shapeLon Int32Array, micro-degrees
// `bytes` is the uncompressed file; see decodeGraphFile for the gzipped one.
export function decodeGraph(bytes) {
  let pos = 0;
  const readByte = () => {
    if (pos >= bytes.length) throw new Error("road graph file is truncated");
    return bytes[pos++];
  };
  const readVarint = () => {
    let b = readByte();
    let value = b & 127;
    let scale = 128;
    while (b & 128) {
      b = readByte();
      value += (b & 127) * scale;
      scale *= 128;
    }
    return value;
  };
  const readZigzag = () => {
    const v = readVarint();
    return v % 2 === 0 ? v / 2 : -(v + 1) / 2;
  };

  for (const expected of MAGIC) if (readByte() !== expected) throw new Error("not a RescueNet road graph file");
  const version = readByte();
  if (version !== FORMAT_VERSION) throw new Error(`road graph format version ${version} is not supported`);

  const bbox = [readZigzag() / 1e6, readZigzag() / 1e6, readZigzag() / 1e6, readZigzag() / 1e6];

  const decoder = new TextDecoder();
  const names = new Array(readVarint());
  for (let i = 0; i < names.length; i += 1) {
    const size = readVarint();
    names[i] = decoder.decode(bytes.subarray(pos, pos + size));
    pos += size;
  }

  const nodeCount = readVarint();
  const nodeLat = new Int32Array(nodeCount);
  const nodeLon = new Int32Array(nodeCount);
  let lat = 0;
  let lon = 0;
  for (let i = 0; i < nodeCount; i += 1) {
    lat += readZigzag();
    lon += readZigzag();
    nodeLat[i] = lat;
    nodeLon[i] = lon;
  }

  const edgeCount = readVarint();
  const edgeA = new Int32Array(edgeCount);
  const edgeB = new Int32Array(edgeCount);
  const edgeLenDm = new Uint32Array(edgeCount);
  const edgeClass = new Uint8Array(edgeCount);
  const edgeFlags = new Uint8Array(edgeCount);
  const edgeName = new Uint32Array(edgeCount);
  const shapeStart = new Uint32Array(edgeCount + 1);
  let shapeLat = new Int32Array(1 << 16);
  let shapeLon = new Int32Array(1 << 16);
  let shapeCount = 0;
  let a = 0;
  for (let i = 0; i < edgeCount; i += 1) {
    a += readVarint();
    edgeA[i] = a;
    edgeB[i] = a + readZigzag();
    edgeLenDm[i] = readVarint();
    edgeClass[i] = readByte();
    edgeFlags[i] = readByte();
    edgeName[i] = readVarint();
    shapeStart[i] = shapeCount;
    const points = readVarint();
    if (shapeCount + points > shapeLat.length) {
      let size = shapeLat.length * 2;
      while (size < shapeCount + points) size *= 2;
      const growLat = new Int32Array(size);
      const growLon = new Int32Array(size);
      growLat.set(shapeLat.subarray(0, shapeCount));
      growLon.set(shapeLon.subarray(0, shapeCount));
      shapeLat = growLat;
      shapeLon = growLon;
    }
    let pLat = nodeLat[a];
    let pLon = nodeLon[a];
    for (let k = 0; k < points; k += 1) {
      pLat += readZigzag();
      pLon += readZigzag();
      shapeLat[shapeCount] = pLat;
      shapeLon[shapeCount] = pLon;
      shapeCount += 1;
    }
  }
  shapeStart[edgeCount] = shapeCount;

  return {
    version,
    bbox,
    names,
    nodeLat,
    nodeLon,
    edgeA,
    edgeB,
    edgeLenDm,
    edgeClass,
    edgeFlags,
    edgeName,
    shapeStart,
    shapeLat: shapeLat.slice(0, shapeCount),
    shapeLon: shapeLon.slice(0, shapeCount),
  };
}

// Reads the file as it is served: gzipped bytes (what the build writes) or, for
// tests, the uncompressed bytes. DecompressionStream is in current browsers, the
// Android WebView and Node.
export async function decodeGraphFile(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return decodeGraph(new Uint8Array(await new Response(stream).arrayBuffer()));
  }
  return decodeGraph(bytes);
}
