"use client";

import { useSyncExternalStore } from "react";
import { CircleCheck } from "lucide-react";
import Popup from "@/components/Popup";
import { getOfflineState, subscribeOfflineState } from "@/lib/offline/manager";

// "Map saved": the map for this area is stored on the device, so it still draws
// with no connection (lib/offline/mapStore.js). Website only: the Android app
// is built with mobile/overlay/components/map/MapSavedNotice.js (nothing), because
// its map is inside the APK.
export default function MapSavedNotice() {
  const saved = useSyncExternalStore(
    subscribeOfflineState,
    () => getOfflineState().parts.map === true,
    () => false,
  );
  if (!saved) return null;
  return (
    <Popup id="map-saved" data-testid="map-saved" className="border-safe/40 text-xs">
      <CircleCheck className="size-4 shrink-0 text-safe" aria-hidden="true" />
      Map saved
    </Popup>
  );
}
