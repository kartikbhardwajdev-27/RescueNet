// The routing service: loads the road graph once, builds the router, and answers
// route requests. It runs inside the Web Worker (routing.worker.js); the client
// (client.js) falls back to running it on the main thread if workers are not
// available. Every method takes and returns plain data, so it can cross the worker
// boundary, and all of them wait for the graph to be ready first.

import { createRouter, SNAP_LIMIT_M } from "./engine.js";
import { createGraphLoader } from "./graphStore.js";
import { haversineM } from "./geometry.js";

// How many of the nearest candidates (by straight line) are routed when looking for
// the cheapest one.
export const NEAREST_CANDIDATES = 3;

export function createRoutingService({ loader = createGraphLoader(), clock = () => Date.now() } = {}) {
  let ready = null;

  function start() {
    if (!ready) {
      ready = (async () => {
        const t0 = clock();
        const { graph, meta, source } = await loader.load();
        const t1 = clock();
        const router = createRouter(graph);
        const info = { source, builtAt: meta.builtAt ?? null, bbox: graph.bbox, stats: router.stats, loadMs: t1 - t0, indexMs: clock() - t1 };
        return { router, info };
      })();
      // A failure is not remembered: the next call tries again (the connection may be back).
      ready.catch(() => {
        ready = null;
      });
    }
    return ready;
  }

  return {
    // Loads the graph; resolves a summary of what was loaded and how long it took.
    async init() {
      return (await start()).info;
    },

    // Saves the graph on the device without building the router (for warming up).
    warm: () => loader.ensureSaved(),

    // Snaps a point to the nearest road of a profile.
    async snap({ point, profile }) {
      const { router } = await start();
      return router.snap(point.lat, point.lon, profile);
    },

    // One route. See engine.js for the arguments and the result.
    async route(params) {
      const { router } = await start();
      return router.route(params);
    },

    // The cheapest route to one of several places. `candidates` are [{ id, lat, lon }];
    // the nearest NEAREST_CANDIDATES by straight line are routed and the one with the
    // lowest cost wins (cost includes the penalty for passing an avoid zone).
    // Resolves
    //   { status: "ok", best: { candidate, route }, tried: [{ id, status, distanceM, durationS, cost, crossedZones }] }
    //   { status: "outside-coverage", where: "start" | "end" }
    //   { status: "no-route" }
    async routeToNearest({ from, candidates, profile = "walk", zones = [], limit = NEAREST_CANDIDATES }) {
      const { router } = await start();
      if (!router.snap(from.lat, from.lon, profile)) return { status: "outside-coverage", where: "start", snapLimitM: SNAP_LIMIT_M };

      const nearest = [...candidates]
        .map((candidate) => ({ candidate, line: haversineM(from.lat, from.lon, candidate.lat, candidate.lon) }))
        .sort((a, b) => a.line - b.line || String(a.candidate.id).localeCompare(String(b.candidate.id)))
        .slice(0, limit);

      const tried = [];
      let best = null;
      for (const { candidate } of nearest) {
        const route = router.route({ from, to: candidate, profile, zones });
        tried.push({
          id: candidate.id,
          status: route.status,
          distanceM: route.distanceM ?? null,
          durationS: route.durationS ?? null,
          cost: route.cost ?? null,
          crossedZones: route.crossedZones?.length ?? 0,
        });
        if (route.status === "ok" && (!best || route.cost < best.route.cost)) best = { candidate, route };
      }
      if (best) return { status: "ok", best, tried };
      const onlyCoverage = tried.length > 0 && tried.every((t) => t.status === "outside-coverage");
      return onlyCoverage ? { status: "outside-coverage", where: "end", snapLimitM: SNAP_LIMIT_M } : { status: "no-route" };
    },
  };
}
