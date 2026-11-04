// The offline copy of the map (tricity.pmtiles, about 4 MB) in the Cache API,
// and the one-file PMTiles source that reads from it.
//
// Why a whole copy and not Range requests: a service worker cannot answer Range
// requests from a cache without its own 206 handling, and the network may be gone
// entirely. So the file is downloaded once, in full, kept in a cache of its own
// ("rescuenet-offline-data", not touched by the service worker's cache clean-up),
// and tiles are cut out of memory, the same idea as the Android app's bundled map
// (mobile/overlay/components/map/mapRuntime.js).
//
// Before the copy exists the source simply reads ranges from the server (the
// ordinary PMTiles way), so the map works online from the first visit.
//
// Everything that can fail is reported as a result, never thrown to the caller:
//   saveMap() -> { ok: true } | { ok: false, reason: "quota" | "network" | "invalid" | "unsupported", message }

import { FetchSource } from "pmtiles";
import { PMTILES_PATH } from "@/components/map/mapConfig";

export const DATA_CACHE = "rescuenet-offline-data";
const META_KEY = "/__rescuenet-map-meta.json";
// The file must be at least this long to be a map at all (a PMTiles v3 header is 127 bytes).
const HEADER_BYTES = 127;
// Room wanted on top of the file itself before starting, as a multiple of its size.
const HEADROOM = 2;

const cachesAvailable = () => typeof caches !== "undefined";
const mapUrl = () => new URL(PMTILES_PATH, globalThis.location.origin).href;

// A PMTiles v3 file starts with "PMTiles", a version byte of 3, and a header that
// says where the tile data ends; the file must reach that far or it was cut short.
export function checkPmtiles(buffer) {
  if (buffer.byteLength < HEADER_BYTES) return { ok: false, message: "The map file is too small." };
  const view = new DataView(buffer);
  const magic = String.fromCharCode(...new Uint8Array(buffer, 0, 7));
  if (magic !== "PMTiles" || view.getUint8(7) !== 3) return { ok: false, message: "That is not a map file." };
  const tileDataEnd = Number(view.getBigUint64(56, true) + view.getBigUint64(64, true));
  if (buffer.byteLength < tileDataEnd) return { ok: false, message: "The map file was cut short." };
  return { ok: true };
}

export async function savedMapInfo() {
  if (!cachesAvailable()) return null;
  try {
    const cache = await caches.open(DATA_CACHE);
    const [meta, file] = await Promise.all([cache.match(META_KEY), cache.match(mapUrl())]);
    if (!meta || !file) return null;
    const info = await meta.json();
    return typeof info?.bytes === "number" && typeof info?.savedAt === "number" ? info : null;
  } catch {
    return null;
  }
}

// Asks the browser to keep this site's data when storage runs low. Best effort.
async function askForPersistentStorage() {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

async function roomFor(bytes) {
  try {
    const { usage = 0, quota = 0 } = (await navigator.storage?.estimate?.()) ?? {};
    return !quota || quota - usage >= bytes * HEADROOM;
  } catch {
    return true; // cannot tell: try, and handle a quota error if it comes
  }
}

let saving = null;

// Downloads the map and keeps it. `onProgress(fraction)` gets 0..1 (or null while
// the size is unknown). One download at a time: a second call joins the first.
export function saveMap({ onProgress } = {}) {
  saving ??= doSave(onProgress).finally(() => {
    saving = null;
  });
  return saving;
}

async function doSave(onProgress) {
  if (!cachesAvailable()) return { ok: false, reason: "unsupported", message: "This browser cannot save the map for offline use." };
  try {
    await askForPersistentStorage();
    let response;
    try {
      response = await fetch(mapUrl(), { cache: "no-store" });
    } catch {
      return { ok: false, reason: "network", message: "Couldn't download the map. Check the connection." };
    }
    if (!response.ok || !response.body) return { ok: false, reason: "network", message: `Couldn't download the map (${response.status}).` };

    const declared = Number(response.headers.get("content-length")) || 0;
    if (declared && !(await roomFor(declared))) return { ok: false, reason: "quota", message: "Not enough storage on this device to save the map." };

    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
      onProgress?.(declared ? Math.min(1, received / declared) : null);
    }
    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const checked = checkPmtiles(bytes.buffer);
    if (!checked.ok) return { ok: false, reason: "invalid", message: checked.message };

    const cache = await caches.open(DATA_CACHE);
    // The meta record goes in last: no meta, no map.
    await cache.delete(META_KEY);
    await cache.put(mapUrl(), new Response(bytes, { headers: { "content-type": "application/octet-stream" } }));
    await cache.put(META_KEY, new Response(JSON.stringify({ bytes: received, savedAt: Date.now() }), { headers: { "content-type": "application/json" } }));
    onProgress?.(1);
    return { ok: true };
  } catch (error) {
    if (error?.name === "QuotaExceededError") return { ok: false, reason: "quota", message: "Not enough storage on this device to save the map." };
    return { ok: false, reason: "network", message: "Couldn't save the map." };
  }
}

// The PMTiles source: the saved whole file when there is one, else ranges from
// the server. A saved copy that stops being readable (the browser cleared it) falls
// back to the server again.
export class OfflineFirstSource {
  constructor(url) {
    this.url = url;
    this.live = new FetchSource(url);
    this.whole = null;
    this.nextLookup = 0;
  }

  // Must equal the URL in the map style (pmtiles://<url>), which is how the
  // protocol finds this source (components/map/mapConfig.js buildStyle).
  getKey() {
    return this.url;
  }

  async loadWhole() {
    if (this.whole) return this.whole;
    if (Date.now() < this.nextLookup) return null; // looked a moment ago, nothing there
    try {
      if (cachesAvailable() && (await savedMapInfo())) {
        const cache = await caches.open(DATA_CACHE);
        const response = await cache.match(mapUrl());
        const buffer = response ? await response.arrayBuffer() : null;
        if (buffer && checkPmtiles(buffer).ok) {
          this.whole = buffer;
          return buffer;
        }
      }
    } catch {
      // fall through to the server
    }
    this.nextLookup = Date.now() + 3000;
    return null;
  }

  async getBytes(offset, length, signal, etag) {
    const whole = await this.loadWhole();
    if (whole) return { data: whole.slice(offset, offset + length) };
    return this.live.getBytes(offset, length, signal, etag);
  }
}
