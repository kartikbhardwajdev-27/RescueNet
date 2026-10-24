"use client";

import dynamic from "next/dynamic";
import MapSkeleton from "./MapSkeleton";

// MapLibre needs the browser (WebGL, window), so the map is never rendered on
// the server. `ssr: false` is only allowed in a Client Component, hence this
// small wrapper between the server page and the map.
const MapView = dynamic(() => import("./MapView"), { ssr: false, loading: () => <MapSkeleton /> });

export default function MapLoader() {
  return <MapView />;
}
