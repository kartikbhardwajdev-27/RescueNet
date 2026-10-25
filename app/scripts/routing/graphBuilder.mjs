// Turns classified OSM ways into the compact road graph (see lib/routing/format.js).
// Pure data in, pure data out: no files, no network, so it can be tested with a
// handful of made-up roads (npm run check:routing).
//
// Steps:
//   1. One-way ways are turned so that "forward" always means the allowed direction.
//   2. A node is a junction if it is the end of a way or is used twice or more.
//      Ways are cut at junctions into edges; the nodes between junctions become the
//      edge's shape.
//   3. Chains of two edges meeting at a node where nothing else meets, and which are
//      the same kind of road (class, name, modes, direction), are joined into one.
//   4. Only the biggest connected piece is kept for each mode: for walking, the biggest
//      connected set of roads; for cars, the biggest strongly connected set (every
//      place in it can be reached from every other place, obeying one-ways). Anything
//      else is an island that no route could reach, or leave.
//   5. Chains are joined again (dropping a side road can leave a plain bend), nodes are
//      put in Z-order and edges sorted, ready for encodeGraph.

import { FLAG_DRIVE, FLAG_ONEWAY, FLAG_WALK } from "../../lib/routing/format.js";
import { haversineM } from "../../lib/routing/geometry.js";

// ---- step 3 & 5: joining chains ----

const sameKind = (e1, e2) => e1.cls === e2.cls && e1.flags === e2.flags && e1.name === e2.name;

// The shape points of an edge, listed in the order of travel from `from`.
const shapeFrom = (edge, from) => (edge.a === from ? edge.mid : [...edge.mid].reverse());

// Joins edges meeting at nodes where exactly two edges meet. Returns the new edge list.
export function joinChains(edges) {
  const incident = new Map();
  const add = (node, edge) => {
    const list = incident.get(node);
    if (list) list.push(edge);
    else incident.set(node, [edge]);
  };
  for (const edge of edges) {
    add(edge.a, edge);
    add(edge.b, edge);
  }

  let joined = 0;
  const made = [];
  for (const [v, list] of incident) {
    if (list.length !== 2) continue;
    const [e1, e2] = list;
    if (e1 === e2 || e1.dead || e2.dead || !sameKind(e1, e2)) continue;
    const s1 = e1.a === v ? e1.b : e1.a; // e1 runs s1 -> v
    const t2 = e2.a === v ? e2.b : e2.a; // e2 runs v -> t2
    if (s1 === t2) continue; // would make a loop
    const oneway = (e1.flags & FLAG_ONEWAY) !== 0;
    const along1 = e1.b === v; // does a one-way e1 point along s1 -> v?
    const along2 = e2.a === v; // does a one-way e2 point along v -> t2?
    if (oneway && along1 !== along2) continue; // the two point at each other (or away): not one road

    let a = s1;
    let b = t2;
    let mid = [...shapeFrom(e1, s1), v, ...shapeFrom(e2, v)];
    if (oneway && !along1) {
      // Both point against the travel order used above: store them pointing a -> b.
      a = t2;
      b = s1;
      mid = mid.reverse();
    }
    const merged = { a, b, mid, cls: e1.cls, flags: e1.flags, name: e1.name };
    e1.dead = true;
    e2.dead = true;
    made.push(merged);
    // The two outer ends now point at the merged edge. A later pass over s1 or t2
    // sees the merged edge, which has the same kind, so chains of any length join.
    const swap = (node, from) => {
      const l = incident.get(node);
      l[l.indexOf(from)] = merged;
    };
    swap(s1, e1);
    swap(t2, e2);
    incident.delete(v);
    joined += 1;
  }
  // Chains longer than three edges: a merged edge can itself be a degree-2 link again.
  const alive = [...edges.filter((e) => !e.dead), ...made].filter((e) => !e.dead);
  return joined > 0 ? joinChains(alive) : alive;
}

// ---- step 4: components ----

// Union-find over vertex ids 0..n-1.
function components(n, edges, usable) {
  const parent = new Int32Array(n).map((_, i) => i);
  const find = (x) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  for (const e of edges) if (usable(e)) parent[find(e.a)] = find(e.b);
  return find;
}

// Strongly connected components of the directed graph the edges make for cars
// (iterative Tarjan: a recursive version would overflow the stack on a city).
// Returns an Int32Array: the component number of every vertex.
function stronglyConnected(n, edges) {
  const start = new Int32Array(n + 1);
  const arcs = [];
  for (const e of edges) {
    if (!(e.flags & FLAG_DRIVE)) continue;
    arcs.push([e.a, e.b]);
    if (!(e.flags & FLAG_ONEWAY)) arcs.push([e.b, e.a]);
  }
  for (const [from] of arcs) start[from + 1] += 1;
  for (let i = 0; i < n; i += 1) start[i + 1] += start[i];
  const to = new Int32Array(arcs.length);
  const fill = start.slice(0, n);
  for (const [from, target] of arcs) to[fill[from]++] = target;

  const index = new Int32Array(n).fill(-1);
  const low = new Int32Array(n);
  const onStack = new Uint8Array(n);
  const comp = new Int32Array(n).fill(-1);
  const stack = [];
  const call = []; // [vertex, next arc to look at]
  let counter = 0;
  let compCount = 0;
  for (let root = 0; root < n; root += 1) {
    if (index[root] !== -1) continue;
    call.push([root, start[root]]);
    index[root] = low[root] = counter++;
    stack.push(root);
    onStack[root] = 1;
    while (call.length > 0) {
      const frame = call[call.length - 1];
      const v = frame[0];
      if (frame[1] < start[v + 1]) {
        const w = to[frame[1]++];
        if (index[w] === -1) {
          index[w] = low[w] = counter++;
          stack.push(w);
          onStack[w] = 1;
          call.push([w, start[w]]);
        } else if (onStack[w]) {
          low[v] = Math.min(low[v], index[w]);
        }
      } else {
        if (low[v] === index[v]) {
          let w;
          do {
            w = stack.pop();
            onStack[w] = 0;
            comp[w] = compCount;
          } while (w !== v);
          compCount += 1;
        }
        call.pop();
        if (call.length > 0) {
          const parent = call[call.length - 1][0];
          low[parent] = Math.min(low[parent], low[v]);
        }
      }
    }
  }
  return comp;
}

// The most common value of a typed array restricted to `members` (by count).
function biggest(values, members) {
  const counts = new Map();
  for (const v of members) counts.set(values[v], (counts.get(values[v]) ?? 0) + 1);
  let best = -1;
  let bestCount = -1;
  let total = 0;
  for (const [id, count] of counts) {
    total += count;
    if (count > bestCount) {
      best = id;
      bestCount = count;
    }
  }
  return { id: best, size: Math.max(bestCount, 0), pieces: counts.size, total };
}

// ---- ordering ----

// Interleaves the bits of two 16-bit numbers (a Z-order curve), so points close on
// the map get close numbers.
function zOrder(x, y) {
  const spread = (v) => {
    v = (v | (v << 8)) & 0x00ff00ff;
    v = (v | (v << 4)) & 0x0f0f0f0f;
    v = (v | (v << 2)) & 0x33333333;
    v = (v | (v << 1)) & 0x55555555;
    return v;
  };
  return ((spread(x) | (spread(y) << 1)) >>> 0);
}

// ---- the build ----

// ways: [{ nodes: number[] (indexes into lat/lon), cls, flags, oneway: 1 | -1 | 0, name }]
// lat/lon: degrees, indexed like the nodes in ways.
// Returns { graph, stats }; graph is what encodeGraph takes.
export function buildGraph({ bbox, lat, lon, ways }) {
  // 1. names, directions
  const names = [""];
  const nameIndex = new Map([["", 0]]);
  const nameOf = (text) => {
    let i = nameIndex.get(text);
    if (i === undefined) {
      i = names.length;
      names.push(text);
      nameIndex.set(text, i);
    }
    return i;
  };

  const prepared = [];
  const uses = new Uint8Array(lat.length); // how often each node appears (stops counting at 255)
  const bump = (node, by) => {
    uses[node] = Math.min(255, uses[node] + by);
  };
  for (const way of ways) {
    // A way is a line of at least two different nodes.
    const nodes = way.nodes.filter((node, i) => i === 0 || node !== way.nodes[i - 1]);
    if (nodes.length < 2) continue;
    let flags = way.flags;
    let list = nodes;
    if (way.oneway !== 0 && flags & FLAG_DRIVE) {
      flags |= FLAG_ONEWAY;
      if (way.oneway === -1) list = [...nodes].reverse();
    }
    prepared.push({ nodes: list, cls: way.cls, flags, name: nameOf(way.name) });
    // 2. junction counting: way ends always count as junctions
    bump(list[0], 2);
    bump(list[list.length - 1], 2);
    for (let i = 1; i < list.length - 1; i += 1) bump(list[i], 1);
  }

  // 2. cut at junctions
  let edges = [];
  for (const way of prepared) {
    let from = way.nodes[0];
    let mid = [];
    for (let i = 1; i < way.nodes.length; i += 1) {
      const node = way.nodes[i];
      if (uses[node] >= 2) {
        if (node !== from) edges.push({ a: from, b: node, mid, cls: way.cls, flags: way.flags, name: way.name });
        from = node;
        mid = [];
      } else {
        mid.push(node);
      }
    }
  }
  const stats = { ways: prepared.length, edgesBeforeJoin: edges.length };

  // 3. join chains
  edges = joinChains(edges);
  stats.edgesAfterJoin = edges.length;

  // 4. keep the biggest connected piece per mode
  // Vertex ids 0..V-1 for the nodes that edges touch.
  const vertexOf = new Map();
  const vertexNode = [];
  const vid = (node) => {
    let v = vertexOf.get(node);
    if (v === undefined) {
      v = vertexNode.length;
      vertexOf.set(node, v);
      vertexNode.push(node);
    }
    return v;
  };
  for (const e of edges) {
    e.va = vid(e.a);
    e.vb = vid(e.b);
  }
  const vertexCount = vertexNode.length;
  const index = edges.map((e) => ({ a: e.va, b: e.vb, flags: e.flags }));

  const lengthM = (e) => {
    let total = 0;
    let pLat = lat[e.a];
    let pLon = lon[e.a];
    for (const node of [...e.mid, e.b]) {
      total += haversineM(pLat, pLon, lat[node], lon[node]);
      pLat = lat[node];
      pLon = lon[node];
    }
    return total;
  };
  for (const e of edges) e.lengthM = lengthM(e);
  const km = (filter) => edges.filter(filter).reduce((sum, e) => sum + e.lengthM, 0) / 1000;
  const before = { walkKm: km((e) => e.flags & FLAG_WALK), driveKm: km((e) => e.flags & FLAG_DRIVE) };

  const walkFind = components(vertexCount, index, (e) => e.flags & FLAG_WALK);
  const walkVertices = new Set();
  for (const e of index) if (e.flags & FLAG_WALK) walkVertices.add(e.a).add(e.b);
  const walkRoots = new Int32Array(vertexCount);
  for (const v of walkVertices) walkRoots[v] = walkFind(v);
  const walkMain = biggest(walkRoots, walkVertices);

  const driveComp = stronglyConnected(vertexCount, index);
  const driveVertices = new Set();
  for (const e of index) if (e.flags & FLAG_DRIVE) driveVertices.add(e.a).add(e.b);
  const driveMain = biggest(driveComp, driveVertices);

  let kept = [];
  for (const e of edges) {
    let flags = e.flags;
    if (flags & FLAG_WALK && !(walkRoots[e.va] === walkMain.id && walkRoots[e.vb] === walkMain.id)) flags &= ~FLAG_WALK;
    if (flags & FLAG_DRIVE && !(driveComp[e.va] === driveMain.id && driveComp[e.vb] === driveMain.id)) flags &= ~(FLAG_DRIVE | FLAG_ONEWAY);
    if (flags & (FLAG_WALK | FLAG_DRIVE)) kept.push({ a: e.a, b: e.b, mid: e.mid, cls: e.cls, flags, name: e.name });
  }

  // 5. join again, then order
  kept = joinChains(kept);
  for (const e of kept) e.lengthM = lengthM(e);

  const used = [...new Set(kept.flatMap((e) => [e.a, e.b]))];
  const toMicro = (deg) => Math.round(deg * 1e6);
  const [west, south, east, north] = bbox;
  const key = new Map(
    used.map((node) => [
      node,
      zOrder(
        Math.max(0, Math.min(65535, Math.floor(((lon[node] - west) / (east - west)) * 65535))),
        Math.max(0, Math.min(65535, Math.floor(((lat[node] - south) / (north - south)) * 65535))),
      ),
    ]),
  );
  used.sort((p, q) => key.get(p) - key.get(q) || p - q);
  const newIndex = new Map(used.map((node, i) => [node, i]));

  const edgeList = kept
    .map((e) => {
      const shape = [];
      for (const node of e.mid) shape.push(toMicro(lat[node]), toMicro(lon[node]));
      return {
        a: newIndex.get(e.a),
        b: newIndex.get(e.b),
        lengthDm: Math.round(e.lengthM * 10),
        cls: e.cls,
        flags: e.flags,
        name: e.name,
        shape,
        lengthM: e.lengthM,
      };
    })
    .sort((p, q) => p.a - q.a || p.b - q.b);

  // Names that survived, renumbered so the table has no unused entries.
  const nameMap = new Map([[0, 0]]);
  const finalNames = [""];
  for (const e of edgeList) {
    if (!nameMap.has(e.name)) {
      nameMap.set(e.name, finalNames.length);
      finalNames.push(names[e.name]);
    }
    e.name = nameMap.get(e.name);
  }

  const graph = {
    bbox,
    names: finalNames,
    nodeLat: Int32Array.from(used, (node) => toMicro(lat[node])),
    nodeLon: Int32Array.from(used, (node) => toMicro(lon[node])),
    edges: edgeList,
  };

  const after = {
    walkKm: edgeList.filter((e) => e.flags & FLAG_WALK).reduce((s, e) => s + e.lengthM, 0) / 1000,
    driveKm: edgeList.filter((e) => e.flags & FLAG_DRIVE).reduce((s, e) => s + e.lengthM, 0) / 1000,
  };

  Object.assign(stats, {
    vertices: used.length,
    edges: edgeList.length,
    shapePoints: edgeList.reduce((sum, e) => sum + e.shape.length / 2, 0),
    names: finalNames.length - 1,
    before,
    after,
    walk: { pieces: walkMain.pieces, largestVertices: walkMain.size, vertices: walkMain.total },
    drive: { pieces: driveMain.pieces, largestVertices: driveMain.size, vertices: driveMain.total },
  });
  return { graph, stats };
}
