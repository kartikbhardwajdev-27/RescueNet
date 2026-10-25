// The page's side of routing: starts the Web Worker, sends it requests and gives
// back promises.
//
//   const routing = getRoutingClient();
//   const info = await routing.init();                      // loads the road graph
//   const result = await routing.route({ from, to, profile, zones });
//   const nearest = await routing.routeToNearest({ from, candidates, profile, zones });
//
// If the browser cannot start the worker (very old WebView, a blocked script), the
// same service runs on the main thread instead, so navigation still works; routes
// then briefly hold up the page while they are worked out.

import { SERVICE_METHODS } from "./methods.js";

export function createRoutingClient({ makeWorker, makeService } = {}) {
  const startWorker =
    makeWorker ??
    (() => {
      if (typeof Worker === "undefined") throw new Error("This browser has no Web Workers");
      return new Worker(new URL("./routing.worker.js", import.meta.url));
    });
  const startService =
    makeService ??
    (async () => {
      // Loaded only now: the engine stays out of the page's own code unless the worker fails.
      const { createRoutingService } = await import("./service.js");
      return createRoutingService();
    });

  let worker = null;
  let mainService = null;
  let mode = null; // "worker" | "main"
  let nextId = 1;
  const pending = new Map();

  async function runOnMainThread(method, params) {
    mainService ??= await startService();
    return mainService[method](params);
  }

  function switchToMainThread() {
    mode = "main";
    worker?.terminate?.();
    worker = null;
    // Whatever was waiting on the worker is asked of the main-thread service instead.
    for (const [id, call] of pending) {
      pending.delete(id);
      runOnMainThread(call.method, call.params).then(call.resolve, call.reject);
    }
  }

  function ensureWorker() {
    if (mode) return;
    try {
      worker = startWorker();
      mode = "worker";
      worker.onmessage = (event) => {
        const { id, ok, result, error } = event.data;
        const call = pending.get(id);
        if (!call) return;
        pending.delete(id);
        if (ok) call.resolve(result);
        else call.reject(Object.assign(new Error(error.message), { code: error.code }));
      };
      // The worker's script failed to load or crashed outright.
      worker.onerror = () => switchToMainThread();
    } catch {
      mode = "main";
    }
  }

  function call(method, params) {
    if (!SERVICE_METHODS.includes(method)) return Promise.reject(new Error(`Unknown routing method "${method}"`));
    ensureWorker();
    if (mode === "main") return runOnMainThread(method, params);
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { method, params, resolve, reject });
      worker.postMessage({ id, method, params });
    });
  }

  return {
    init: () => call("init"),
    warm: () => call("warm"),
    snap: (params) => call("snap", params),
    route: (params) => call("route", params),
    routeToNearest: (params) => call("routeToNearest", params),
    get mode() {
      return mode;
    },
    dispose() {
      worker?.terminate?.();
      worker = null;
      mode = null;
      for (const [id, entry] of pending) {
        pending.delete(id);
        entry.reject(new Error("Routing was shut down"));
      }
    },
  };
}

let shared = null;

// One client for the whole page.
export function getRoutingClient() {
  shared ??= createRoutingClient();
  return shared;
}
