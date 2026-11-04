// Gets the website ready to work with no connection, and says truthfully whether
// it is. The "Offline ready" indicator (components/OfflineReady.js) shows this.
//
// "Ready" is never a flag somebody set: every check below looks at what is really
// on the device, and runs again every minute and whenever the connection comes
// back, so a browser that cleared something turns "ready" back into "preparing".
//
//   pages   the service worker has saved every route and its scripts (it checks
//           its own cache: public/sw.js, "status")
//   data    the saved copy of incidents, shelters, events and stats exists
//           (lib/savedData.js)
//   map     tricity.pmtiles is in the device cache, whole and valid (mapStore.js)
//   graph   the road graph for navigation is saved (lib/routing/graphStore.js)
//
// Where something is missing and the server is reachable, it is fetched.

import { fetchEvents, fetchIncidents, fetchShelters, fetchStats } from "@/lib/api";
import { createGraphLoader, indexedDbStore } from "@/lib/routing/graphStore";
import { recallResponse } from "@/lib/savedData";
import { saveMap, savedMapInfo } from "./mapStore";

const LISTS = ["/api/stats", "/api/incidents?limit=200", "/api/shelters?limit=200", "/api/events?limit=200"];
const RECHECK_MS = 60_000;
const REFRESH_DATA_AFTER_MS = 5 * 60_000;
const SW_WAIT_MS = 30_000;
const INCIDENT_PAGES = 30;

const INITIAL = {
  // "unsupported": no service worker here (plain http, an old browser, dev server).
  // "preparing", "ready", or "incomplete" (tried, and something could not be saved).
  phase: "idle",
  parts: { pages: false, data: false, map: false, graph: false },
  savedAt: null, // when the saved data is from (ms)
  mapProgress: null, // 0..1 while the map downloads
  problem: null, // a sentence for "incomplete"
};

let state = INITIAL;
const listeners = new Set();
const setState = (patch) => {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
};
export const getOfflineState = () => state;
export const subscribeOfflineState = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

// ---- the checks ----

function askWorker(worker, message, timeoutMs = 10_000) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), timeoutMs);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(event.data);
    };
    worker.postMessage(message, [channel.port2]);
  });
}

async function activeWorker() {
  if (!("serviceWorker" in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
  return registration?.active ?? null;
}

// Waits (a while) for the service worker to finish installing: the install only
// succeeds once everything is saved (public/sw.js).
async function waitForWorker() {
  const ready = navigator.serviceWorker.ready.catch(() => null);
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), SW_WAIT_MS));
  await Promise.race([ready, timeout]);
  return activeWorker();
}

async function checkPages() {
  const worker = await activeWorker();
  if (!worker) return false;
  const status = await askWorker(worker, { type: "status" });
  return Boolean(status?.ok);
}

async function checkData() {
  const records = await Promise.all(LISTS.map((path) => recallResponse(path)));
  if (records.some((record) => record === null)) return { ok: false, savedAt: null };
  return { ok: true, savedAt: Math.min(...records.map((record) => record.savedAt)) };
}

async function checkMap() {
  return Boolean(await savedMapInfo());
}

async function checkGraph() {
  try {
    const record = await indexedDbStore().get();
    return Boolean(record?.bytes?.byteLength);
  } catch {
    return false;
  }
}

async function checkAll() {
  const [pages, data, map, graph] = await Promise.all([checkPages(), checkData(), checkMap(), checkGraph()]);
  return { parts: { pages, data: data.ok, map, graph }, savedAt: data.savedAt };
}

const allReady = (parts) => Object.values(parts).every(Boolean);

// ---- getting ready ----

async function refreshData() {
  await Promise.allSettled([fetchStats(), fetchIncidents(), fetchShelters(), fetchEvents()]);
}

// Asks the worker to save the incident pages of the saved incidents, so each one
// opens offline (best effort: an incident that was never opened has the shell).
async function saveIncidentPages() {
  const worker = await activeWorker();
  const saved = await recallResponse("/api/incidents?limit=200");
  if (!worker || !Array.isArray(saved?.data)) return;
  const paths = saved.data.slice(0, INCIDENT_PAGES).map((incident) => `/incidents/${incident._id}`);
  if (paths.length > 0) await askWorker(worker, { type: "cache-pages", paths }, 30_000);
}

let running = null;
let lastDataRefresh = 0;

// Does what is missing. Several callers share one run.
export function prepareOffline() {
  running ??= run().finally(() => {
    running = null;
  });
  return running;
}

async function run() {
  if (!("serviceWorker" in navigator) || !globalThis.caches || process.env.NODE_ENV !== "production") {
    setState({ phase: "unsupported" });
    return;
  }
  const before = await checkAll();
  setState({ parts: before.parts, savedAt: before.savedAt, phase: allReady(before.parts) ? "ready" : "preparing", problem: null });

  const online = navigator.onLine !== false;
  let problem = null;

  if (online) {
    // Data first: it is what the pages show, and fast.
    if (!before.parts.data || Date.now() - lastDataRefresh > REFRESH_DATA_AFTER_MS) {
      lastDataRefresh = Date.now();
      await refreshData();
    }
    if (!before.parts.pages) await waitForWorker();
    if (!before.parts.map) {
      const result = await saveMap({ onProgress: (fraction) => setState({ mapProgress: fraction }) });
      setState({ mapProgress: null });
      if (!result.ok) problem = result.message;
    }
    if (!before.parts.graph) {
      const saved = await createGraphLoader().ensureSaved();
      if (!saved) problem = "Couldn't save the road data for navigation.";
    }
    await saveIncidentPages();
  }

  const after = await checkAll();
  if (!after.parts.pages && online) problem ??= "The app's pages are not saved yet.";
  if (!after.parts.data && online) problem ??= "Couldn't save the latest incidents and shelters.";
  setState({
    parts: after.parts,
    savedAt: after.savedAt,
    mapProgress: null,
    phase: allReady(after.parts) ? "ready" : online ? "incomplete" : "preparing",
    problem: allReady(after.parts) ? null : problem,
  });
}

// ---- keeping it true ----

let started = false;
export function startOfflineManager() {
  if (started) return;
  started = true;
  prepareOffline();
  setInterval(() => {
    if (document.visibilityState === "visible") prepareOffline();
  }, RECHECK_MS);
  window.addEventListener("online", () => prepareOffline());
  window.addEventListener("offline", () => prepareOffline());
}
