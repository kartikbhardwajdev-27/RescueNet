"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import "@/components/map/map.css";
import { useEffect, useRef, useState } from "react";
import { Map as MapLibreMap, Marker } from "maplibre-gl";
import { MapPinOff } from "lucide-react";
import { buildStyle, insideCoverage } from "@/components/map/mapConfig";
import { setupMapRuntime } from "@/components/map/mapRuntime";
import { createIncidentMarker } from "@/components/map/markers";
import { webglAvailable } from "@/components/map/webgl";
import { isSosIncident } from "@/lib/incidentRules";

// A small, fixed picture of where an incident is: the offline basemap with the
// incident's own marker. Not draggable; the full map is one tap away. Client
// only (loaded with next/dynamic and ssr: false by IncidentDetail).
export default function IncidentMiniMap({ incident }) {
  const containerRef = useRef(null);
  const [webgl] = useState(webglAvailable);

  const [lng, lat] = incident.location.coordinates;
  const { severity, status, type } = incident;
  const isSos = isSosIncident(incident);

  useEffect(() => {
    if (!webgl) return;
    setupMapRuntime();
    const map = new MapLibreMap({
      container: containerRef.current,
      style: buildStyle(window.location.origin),
      center: [lng, lat],
      zoom: 14,
      maxZoom: 18,
      interactive: false,
      attributionControl: { compact: true },
      renderWorldCopies: false,
    });
    const element = createIncidentMarker({ severity, status, type, isSos });
    element.tabIndex = -1; // decoration here, not a control
    const marker = new Marker({ element }).setLngLat([lng, lat]).addTo(map);
    return () => {
      marker.remove();
      map.remove();
    };
  }, [webgl, lng, lat, severity, status, type, isSos]);

  return (
    <div className="rn-map relative h-56 overflow-hidden rounded-2xl border border-line bg-surface sm:h-72">
      {/* MapLibre's own CSS (unlayered, so it beats Tailwind's layered utilities)
          sets position: relative on its container, which would silently undo an
          absolute inset-0 here and leave it 0 px tall. So the wrapper does the
          positioning and the container just fills it, as in MapView. */}
      <div className="absolute inset-0">
        <div ref={containerRef} className="size-full" />
      </div>
      {!webgl && (
        <p className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-ink-muted">
          This browser can&apos;t draw the map. The coordinates are shown below.
        </p>
      )}
      {webgl && !insideCoverage({ lng, lat }) && (
        <p className="pointer-events-none absolute inset-x-3 top-3 flex items-center gap-2 rounded-xl border border-line-strong bg-surface-raised/90 px-3 py-2 text-xs font-semibold backdrop-blur-xl">
          <MapPinOff className="size-4 shrink-0 text-brand-to" aria-hidden="true" />
          Outside the offline map area (Chandigarh, Mohali, Panchkula).
        </p>
      )}
    </div>
  );
}
