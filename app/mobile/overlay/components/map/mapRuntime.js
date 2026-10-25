import { addProtocol, setWorkerUrl } from "maplibre-gl";
import { PMTiles, Protocol } from "pmtiles";
import { PMTILES_PATH } from "./mapConfig";

// The Android app's map setup. Replaces components/map/mapRuntime.js in the app
// build; the two must export the same function.
//
// The website reads tricity.pmtiles with HTTP range requests, which needs a server
// that answers them. In the app the file is inside the APK (public/maps, bundled
// by scripts/build-mobile.mjs) and is served by Android's own file server, whose
// range handling this code does not trust. So the whole file is read once, with a
// plain request, and tiles are cut out of memory. That works with the laptop off
// and needs no range support anywhere. It suits a small area (the Tricity extract
// is a few MB); build:mobile refuses a file over 150 MB for that reason.
class BundledSource {
  constructor(url) {
    this.url = url;
    this.whole = null;
  }

  // Must equal the URL in the map style (pmtiles://<url>), which is how the
  // protocol finds this source (components/map/mapConfig.js buildStyle).
  getKey() {
    return this.url;
  }

  async getBytes(offset, length) {
    this.whole ??= fetch(this.url).then((response) => {
      if (!response.ok) throw new Error(`The bundled map could not be read (${response.status})`);
      return response.arrayBuffer();
    });
    try {
      const whole = await this.whole;
      return { data: whole.slice(offset, offset + length) };
    } catch (error) {
      this.whole = null; // let the next tile try again
      throw error;
    }
  }
}

let ready = false;

// One-time MapLibre setup, safe to call from every mount.
export function setupMapRuntime() {
  if (ready) return;
  ready = true;
  setWorkerUrl(new URL("../../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);
  const protocol = new Protocol();
  protocol.add(new PMTiles(new BundledSource(`${window.location.origin}${PMTILES_PATH}`)));
  addProtocol("pmtiles", protocol.tile);
}
