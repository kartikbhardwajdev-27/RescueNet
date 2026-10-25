// A minimal reader for OpenStreetMap .osm.pbf files, written for the one job of
// scripts/build-routing.mjs: pull the roads out of a regional extract. No npm
// packages (the format is a few protobuf messages), nothing is sent anywhere.
//
// The format (https://wiki.openstreetmap.org/wiki/PBF_Format): the file is a list of
// blocks, each [4-byte big-endian header size][BlobHeader][Blob]. A Blob holds a
// zlib-compressed PrimitiveBlock, which has a string table (every tag key and
// value is an index into it) and groups of nodes, ways or relations. Nodes
// normally come first in the file, then ways, then relations.
//
// Two passes over the file, both streaming block by block:
//   readNodes(buffer, bbox, onNode)  every node inside the box
//   readHighwayWays(buffer, onWay)   every way that has a "highway" tag
//
// Protobuf numbers larger than 2^53 would lose precision here; OSM ids and
// coordinates are far below that.

import zlib from "node:zlib";

// ---- protobuf basics ----

// Reads a varint at state.pos. Exact up to 2^53, which covers everything used here.
function readVarint(buf, state) {
  let b = buf[state.pos++];
  let value = b & 0x7f;
  let scale = 128;
  while (b >= 0x80) {
    b = buf[state.pos++];
    value += (b & 0x7f) * scale;
    scale *= 128;
  }
  return value;
}

const unzigzag = (v) => (v % 2 === 0 ? v / 2 : -(v + 1) / 2);

// Calls onField(fieldNumber, wireType, a, b) for each field of the message in
// buf[start, end). Wire type 0 (varint): a = the value. Wire type 2 (bytes,
// strings, packed arrays, sub-messages): a = start, b = end of the payload.
function eachField(buf, start, end, onField) {
  const state = { pos: start };
  while (state.pos < end) {
    const key = readVarint(buf, state);
    const field = Math.floor(key / 8);
    const wire = key % 8;
    if (wire === 0) {
      onField(field, 0, readVarint(buf, state));
    } else if (wire === 2) {
      const size = readVarint(buf, state);
      onField(field, 2, state.pos, state.pos + size);
      state.pos += size;
    } else if (wire === 1) {
      state.pos += 8;
    } else if (wire === 5) {
      state.pos += 4;
    } else {
      throw new Error(`unsupported protobuf wire type ${wire}`);
    }
  }
}

// A packed array of varints -> numbers. zigzag=true for sint32/sint64 arrays.
function readPacked(buf, start, end, zigzag) {
  const values = [];
  const state = { pos: start };
  while (state.pos < end) {
    const v = readVarint(buf, state);
    values.push(zigzag ? unzigzag(v) : v);
  }
  return values;
}

// ---- file blocks ----

// Calls onBlock(primitiveBlockBytes) for every OSMData block, in file order.
function eachDataBlock(buffer, onBlock) {
  let pos = 0;
  while (pos + 4 <= buffer.length) {
    const headerSize = buffer.readUInt32BE(pos);
    pos += 4;
    let type = "";
    let dataSize = 0;
    eachField(buffer, pos, pos + headerSize, (field, wire, a, b) => {
      if (field === 1 && wire === 2) type = buffer.toString("utf8", a, b);
      if (field === 3 && wire === 0) dataSize = a;
    });
    pos += headerSize;
    const blobStart = pos;
    const blobEnd = pos + dataSize;
    pos = blobEnd;
    if (type !== "OSMData") continue;

    let raw = null;
    let zlibData = null;
    eachField(buffer, blobStart, blobEnd, (field, wire, a, b) => {
      if (field === 1 && wire === 2) raw = buffer.subarray(a, b);
      if (field === 3 && wire === 2) zlibData = buffer.subarray(a, b);
    });
    if (zlibData) onBlock(zlib.inflateSync(zlibData));
    else if (raw) onBlock(raw);
    else throw new Error("an OSM block uses a compression this reader does not support");
  }
}

// Splits a PrimitiveBlock into its parts without decoding the contents.
function splitBlock(block) {
  const out = { strings: null, groups: [], granularity: 100, latOffset: 0, lonOffset: 0 };
  eachField(block, 0, block.length, (field, wire, a, b) => {
    if (field === 1 && wire === 2) out.strings = [a, b];
    else if (field === 2 && wire === 2) out.groups.push([a, b]);
    else if (field === 17 && wire === 0) out.granularity = a;
    else if (field === 19 && wire === 0) out.latOffset = a;
    else if (field === 20 && wire === 0) out.lonOffset = a;
  });
  return out;
}

function decodeStrings(block, range) {
  const strings = [];
  if (!range) return strings;
  eachField(block, range[0], range[1], (field, wire, a, b) => {
    if (field === 1 && wire === 2) strings.push(block.toString("utf8", a, b));
  });
  return strings;
}

// ---- pass 1: nodes ----

// bbox = [west, south, east, north] in degrees. onNode(id, lat, lon) is called for
// every node inside it, in file order (which is ascending id in Geofabrik files).
export function readNodes(buffer, bbox, onNode) {
  const [west, south, east, north] = bbox;
  eachDataBlock(buffer, (block) => {
    const { groups, granularity, latOffset, lonOffset } = splitBlock(block);
    const toDeg = (offset, raw) => 1e-9 * (offset + granularity * raw);
    for (const [gStart, gEnd] of groups) {
      eachField(block, gStart, gEnd, (field, wire, a, b) => {
        if (wire !== 2) return;
        if (field === 2) {
          // DenseNodes: ids, lats and lons are three parallel delta-coded arrays.
          let ids = null;
          let lats = null;
          let lons = null;
          eachField(block, a, b, (f, w, s, e) => {
            if (w !== 2) return;
            if (f === 1) ids = [s, e];
            else if (f === 8) lats = [s, e];
            else if (f === 9) lons = [s, e];
          });
          if (!ids || !lats || !lons) return;
          const idState = { pos: ids[0] };
          const latState = { pos: lats[0] };
          const lonState = { pos: lons[0] };
          let id = 0;
          let rawLat = 0;
          let rawLon = 0;
          while (idState.pos < ids[1]) {
            id += unzigzag(readVarint(block, idState));
            rawLat += unzigzag(readVarint(block, latState));
            rawLon += unzigzag(readVarint(block, lonState));
            const lat = toDeg(latOffset, rawLat);
            const lon = toDeg(lonOffset, rawLon);
            if (lat >= south && lat <= north && lon >= west && lon <= east) onNode(id, lat, lon);
          }
        } else if (field === 1) {
          // A plain Node (rare in modern files): id=1 lat=8 lon=9.
          let id = 0;
          let rawLat = 0;
          let rawLon = 0;
          eachField(block, a, b, (f, w, v) => {
            if (w !== 0) return;
            if (f === 1) id = unzigzag(v);
            else if (f === 8) rawLat = unzigzag(v);
            else if (f === 9) rawLon = unzigzag(v);
          });
          const lat = toDeg(latOffset, rawLat);
          const lon = toDeg(lonOffset, rawLon);
          if (lat >= south && lat <= north && lon >= west && lon <= east) onNode(id, lat, lon);
        }
      });
    }
  });
}

// ---- pass 2: ways ----

// The tag keys the road builder reads. Everything else is dropped as soon as it is
// read, so the memory used does not depend on how tagged the map is.
export const WANTED_KEYS = new Set([
  "highway",
  "name",
  "name:en",
  "ref",
  "oneway",
  "junction",
  "access",
  "motor_vehicle",
  "vehicle",
  "foot",
  "service",
  "area",
  "motorroad",
  "bridge",
  "tunnel",
]);

// onWay(id, tags, refs): for every way that has a "highway" tag. `tags` holds only
// WANTED_KEYS; `refs` are the OSM node ids along the way, in order.
export function readHighwayWays(buffer, onWay) {
  eachDataBlock(buffer, (block) => {
    const { strings: range, groups } = splitBlock(block);
    // Cheap exit for blocks with no ways (all the node blocks): look at the
    // groups' field numbers before decoding the string table.
    let hasWays = false;
    for (const [gStart, gEnd] of groups) {
      eachField(block, gStart, gEnd, (field) => {
        if (field === 3) hasWays = true;
      });
    }
    if (!hasWays) return;

    const strings = decodeStrings(block, range);
    const wanted = new Map(); // string index -> key name
    let highwayIndex = -1;
    strings.forEach((text, index) => {
      if (WANTED_KEYS.has(text)) wanted.set(index, text);
      if (text === "highway") highwayIndex = index;
    });
    if (highwayIndex < 0) return;

    for (const [gStart, gEnd] of groups) {
      eachField(block, gStart, gEnd, (field, wire, a, b) => {
        if (field !== 3 || wire !== 2) return;
        let id = 0;
        let keys = null;
        let vals = null;
        let refs = null;
        eachField(block, a, b, (f, w, s, e) => {
          if (f === 1 && w === 0) id = s;
          else if (w === 2 && f === 2) keys = [s, e];
          else if (w === 2 && f === 3) vals = [s, e];
          else if (w === 2 && f === 8) refs = [s, e];
        });
        if (!keys || !vals || !refs) return;
        const keyIndexes = readPacked(block, keys[0], keys[1], false);
        if (!keyIndexes.includes(highwayIndex)) return;
        const valIndexes = readPacked(block, vals[0], vals[1], false);
        const tags = {};
        for (let i = 0; i < keyIndexes.length; i += 1) {
          const name = wanted.get(keyIndexes[i]);
          if (name) tags[name] = strings[valIndexes[i]];
        }
        const deltas = readPacked(block, refs[0], refs[1], true);
        const ids = new Array(deltas.length);
        let ref = 0;
        for (let i = 0; i < deltas.length; i += 1) {
          ref += deltas[i];
          ids[i] = ref;
        }
        onWay(id, tags, ids);
      });
    }
  });
}
