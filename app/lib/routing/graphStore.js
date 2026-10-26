// Loads the road graph and keeps a copy on the device, so routing works with no
// connection.
//
//   1. Ask the server (or, in the Android app, the app's own files) for
//      /routing/meta.json. It names the graph file and its checksum.
//   2. If a saved copy in IndexedDB has the same checksum, use that.
//   3. Otherwise download /routing/tricity-roads.rnrg, check its size against
//      meta.json, save it in IndexedDB, and use it.
//   4. If meta.json cannot be reached and a copy is saved, use the saved copy.
//
// So the first time the app is opened with a connection (or in the Android app,
// straight away) the graph is saved, and after that it works offline. If the road
// data is regenerated (npm run routing:build) the new checksum is noticed the next
// time the server is reachable.
//
// The pieces that touch the network and the database are parameters, so the logic
// can be checked in Node (scripts/check-engine.mjs).

import { decodeGraphFile } from "./format.js";

export const GRAPH_BASE = "/routing";
const DB_NAME = "rescuenet-routing";
const STORE_NAME = "graph";
const RECORD_KEY = "tricity";

export class RoutingDataError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RoutingDataError";
    this.code = code; // "graph-missing" | "graph-corrupt"
  }
}

// The saved copy: { sha256, builtAt, bytes: ArrayBuffer } in IndexedDB. Every
// operation resolves (never throws): where IndexedDB is unavailable (some private
// windows) the graph is simply downloaded again next time.
export function indexedDbStore() {
  let dbPromise = null;
  const open = () => {
    if (!dbPromise) {
      dbPromise = new Promise((resolve) => {
        try {
          const request = indexedDB.open(DB_NAME, 1);
          request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => resolve(null);
          request.onblocked = () => resolve(null);
        } catch {
          resolve(null);
        }
      });
    }
    return dbPromise;
  };
  const run = async (mode, action) => {
    const db = await open();
    if (!db) return undefined;
    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(STORE_NAME, mode);
        const request = action(transaction.objectStore(STORE_NAME));
        transaction.oncomplete = () => resolve(request?.result);
        transaction.onerror = () => resolve(undefined);
        transaction.onabort = () => resolve(undefined);
      } catch {
        resolve(undefined);
      }
    });
  };
  return {
    get: () => run("readonly", (store) => store.get(RECORD_KEY)),
    put: (record) => run("readwrite", (store) => store.put(record, RECORD_KEY)),
    clear: () => run("readwrite", (store) => store.delete(RECORD_KEY)),
  };
}

// fetchImpl: like fetch. store: { get, put, clear } as above. base: where /routing is.
export function createGraphLoader({ fetchImpl = (...args) => fetch(...args), store = indexedDbStore(), base = GRAPH_BASE } = {}) {
  async function readMeta() {
    try {
      const response = await fetchImpl(`${base}/meta.json`, { cache: "no-store" });
      if (!response.ok) return null;
      const meta = await response.json();
      return meta && typeof meta.file === "string" && typeof meta.sha256 === "string" ? meta : null;
    } catch {
      return null;
    }
  }

  async function download(meta) {
    let response;
    try {
      response = await fetchImpl(`${base}/${meta.file}`);
    } catch {
      return null;
    }
    if (!response.ok) return null;
    const bytes = await response.arrayBuffer();
    // A download cut short must not be saved as if it were the graph.
    if (meta.bytes?.file && bytes.byteLength !== meta.bytes.file) {
      throw new RoutingDataError("graph-corrupt", `The road data is the wrong size (${bytes.byteLength} bytes, expected ${meta.bytes.file}).`);
    }
    return bytes;
  }

  // Makes sure a copy is on the device and returns { bytes, meta, source } where
  // source is "saved" (already on the device) or "downloaded". Throws a
  // RoutingDataError with code "graph-missing" when there is none and none can be got.
  async function fetchBytes() {
    const meta = await readMeta();
    const saved = await store.get();
    const usable = saved && saved.bytes && typeof saved.sha256 === "string";
    if (usable && (!meta || saved.sha256 === meta.sha256)) {
      return { bytes: saved.bytes, meta: meta ?? { sha256: saved.sha256, builtAt: saved.builtAt }, source: "saved" };
    }
    if (meta) {
      const bytes = await download(meta);
      if (bytes) {
        await store.put({ sha256: meta.sha256, builtAt: meta.builtAt, bytes });
        return { bytes, meta, source: "downloaded" };
      }
      // The graph file could not be fetched but an older saved copy exists: better than nothing.
      if (usable) return { bytes: saved.bytes, meta: { sha256: saved.sha256, builtAt: saved.builtAt }, source: "saved" };
    }
    throw new RoutingDataError("graph-missing", "The road data is not on this device and could not be loaded.");
  }

  return {
    // Downloads and saves the graph without reading it: cheap, for warming the copy up
    // while the connection is there. Resolves true when a copy is saved.
    async ensureSaved() {
      try {
        await fetchBytes();
        return true;
      } catch {
        return false;
      }
    },

    // Resolves { graph, meta, source }.
    async load() {
      const { bytes, meta, source } = await fetchBytes();
      try {
        return { graph: await decodeGraphFile(bytes), meta, source };
      } catch (error) {
        // A saved copy that no longer reads (a format change, a damaged database): drop it.
        await store.clear();
        throw new RoutingDataError("graph-corrupt", `The road data could not be read: ${error.message}`);
      }
    },

    forget: () => store.clear(),
  };
}
