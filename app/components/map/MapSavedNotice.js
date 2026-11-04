"use client";

import { useSyncExternalStore } from "react";
import { CircleCheck } from "lucide-react";
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
    <div
      role="status"
      data-testid="map-saved"
      className="pointer-events-auto flex max-w-full items-center gap-2 rounded-2xl border border-safe/40 bg-surface-raised/90 px-3 py-1.5 text-xs font-semibold shadow-card-hover backdrop-blur-xl"
    >
      <CircleCheck className="size-4 shrink-0 text-safe" aria-hidden="true" />
      Map saved
    </div>
  );
}
