// The Android app's location source. Replaces lib/devicePosition.js (the
// browser's navigator.geolocation) in the app build; the two must export the
// same things.
//
// Asks Android through the Capacitor Geolocation plugin. The plugin shows
// Android's own location permission dialog the first time a position is wanted
// (ACCESS_FINE_LOCATION and ACCESS_COARSE_LOCATION are declared in
// AndroidManifest.xml; on Android 12+ the person may grant only "approximate").
// The adapter below has the shape of navigator.geolocation, so lib/geo.js and the
// register form need no second code path.
import { Geolocation } from "@capacitor/geolocation";

// The plugin rejects with { code: "OS-PLUG-GLOC-00NN" }. Only two matter to the
// screens; everything else ("location is switched off", "no Google Play
// services", ...) is "unavailable".
function positionError(error) {
  const plugin = String(error?.code ?? "");
  const code = plugin.endsWith("0003") ? 1 : plugin.endsWith("0010") ? 3 : 2;
  return { code, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: String(error?.message ?? "") };
}

const adapter = {
  getCurrentPosition(success, failure, options = {}) {
    Geolocation.getCurrentPosition({
      enableHighAccuracy: Boolean(options.enableHighAccuracy),
      timeout: options.timeout ?? 10_000,
      maximumAge: options.maximumAge ?? 0,
    }).then(success, (error) => failure(positionError(error)));
  },
};

export const deviceGeolocation = () => adapter;

export const LOCATION_DENIED_HELP = "Allow location for RescueNet in the phone's Settings (Apps, RescueNet, Permissions) and try again.";

// Asked once, early, so the permission dialog is not what an SOS waits for.
// Only when the person has never been asked (Android reports "prompt"); after a
// refusal the dialog comes back at the next location request, as Android allows.
// Never throws: location services being switched off is not an error here.
export async function askLocationPermissionIfNew() {
  try {
    const { location, coarseLocation } = await Geolocation.checkPermissions();
    if (location === "prompt" && coarseLocation === "prompt") await Geolocation.requestPermissions();
  } catch {
    // Switched off, or the plugin is unavailable: the request is made when a position is needed.
  }
}
