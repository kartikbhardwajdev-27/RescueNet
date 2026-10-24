import { addProtocol, setWorkerUrl } from "maplibre-gl";
import { Protocol } from "pmtiles";

let ready = false;

// One-time MapLibre setup, safe to call from every mount (React strict mode and
// hot reload run effects more than once).
//
//   - the pmtiles:// protocol, so tiles are read from the local .pmtiles file
//     with HTTP range requests
//   - the worker script, served by this app. MapLibre works out its default
//     worker URL from import.meta.url, which a bundler rewrites to a file path,
//     so it is given a real URL here (the bundler copies the file into
//     /_next/static and returns that same-origin URL).
export function setupMapRuntime() {
  if (ready) return;
  ready = true;
  setWorkerUrl(new URL("../../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);
  addProtocol("pmtiles", new Protocol().tile);
}
