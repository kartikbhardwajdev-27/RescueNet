import { addProtocol, setWorkerUrl } from "maplibre-gl";
import { PMTiles, Protocol } from "pmtiles";
import { OfflineFirstSource } from "@/lib/offline/mapStore";
import { PMTILES_PATH } from "./mapConfig";

let ready = false;

// One-time MapLibre setup, safe to call from every mount (React strict mode and
// hot reload run effects more than once).
//
//   - the pmtiles:// protocol. Tiles come from the copy of the map saved on this
//     device (lib/offline/mapStore.js) when there is one, so the map draws with no
//     connection; before that they are read from the server with HTTP range requests.
//   - the worker script, served by this app. MapLibre works out its default
//     worker URL from import.meta.url, which a bundler rewrites to a file path,
//     so it is given a real URL here (the bundler copies the file into
//     /_next/static and returns that same-origin URL).
//
// The Android app is built with mobile/overlay/components/map/mapRuntime.js in
// its place; the two must export the same function.
export function setupMapRuntime() {
  if (ready) return;
  ready = true;
  setWorkerUrl(new URL("../../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);
  const protocol = new Protocol();
  protocol.add(new PMTiles(new OfflineFirstSource(`${window.location.origin}${PMTILES_PATH}`)));
  addProtocol("pmtiles", protocol.tile);
}
