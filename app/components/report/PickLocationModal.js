"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import "@/components/map/map.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { Map as MapLibreMap, Marker, NavigationControl } from "maplibre-gl";
import { MapPin, MapPinOff, X } from "lucide-react";
import { DEFAULT_CENTER, MAX_ZOOM, buildStyle, insideCoverage } from "@/components/map/mapConfig";
import { setupMapRuntime } from "@/components/map/mapRuntime";
import { webglAvailable } from "@/components/map/webgl";
import { getCurrentLocation } from "@/lib/geo";

// "Pick on map" on the Report page: the offline basemap, tap or click to put a draggable pin,
// then "Use this location" hands the point back. Nothing here touches the internet: the same
// local tiles, glyphs and sprites as the Map page. Client only (next/dynamic, ssr: false).
//
//   initial   { lat, lng } from the form's fields, or null; the pin starts there
//   onUse     called with { lat, lng } (numbers, 6 decimals) when the person confirms
//   onClose   called on Close, Escape, or after Use

const START_ZOOM = 12; // no pin and no device location: the Tricity at a glance
const POINT_ZOOM = 15; // centred on a known point

const round6 = (n) => Math.round(n * 1e6) / 1e6;

export default function PickLocationModal({ initial, onUse, onClose }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const closeRef = useRef(null);
  const pointRef = useRef(initial ?? null);
  const [webgl] = useState(webglAvailable);
  const [point, setPointState] = useState(initial ?? null);

  const setPoint = useCallback((next) => {
    pointRef.current = next;
    setPointState(next);
  }, []);

  // Escape closes; focus goes to Close and comes back to the button that opened this.
  useEffect(() => {
    const opener = document.activeElement;
    closeRef.current?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, [onClose]);

  useEffect(() => {
    if (!webgl) return undefined;
    setupMapRuntime();
    const start = pointRef.current;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: buildStyle(window.location.origin),
      center: start ? [start.lng, start.lat] : DEFAULT_CENTER,
      zoom: start ? POINT_ZOOM : START_ZOOM,
      maxZoom: MAX_ZOOM,
      attributionControl: { compact: true },
      renderWorldCopies: false,
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");

    const marker = new Marker({ draggable: true, color: "#3b82f6" });
    markerRef.current = marker;
    let onMap = false;
    const place = (lng, lat) => {
      marker.setLngLat([lng, lat]);
      if (!onMap) {
        marker.addTo(map);
        onMap = true;
      }
      setPoint({ lat: round6(lat), lng: round6(lng) });
    };
    if (start) {
      marker.setLngLat([start.lng, start.lat]).addTo(map);
      onMap = true;
    }

    map.on("click", (event) => place(event.lngLat.lng, event.lngLat.lat));
    marker.on("drag", () => {
      const { lng, lat } = marker.getLngLat();
      setPoint({ lat: round6(lat), lng: round6(lng) });
    });
    marker.on("dragend", () => {
      const { lng, lat } = marker.getLngLat();
      setPoint({ lat: round6(lat), lng: round6(lng) });
    });

    // No pin yet: centre on the person if the device will say where they are. A failure or a
    // refusal just leaves the default view; it never blocks picking by hand.
    let cancelled = false;
    if (!start) {
      getCurrentLocation({ timeoutMs: 6000 })
        .then(({ lat, lng }) => {
          if (!cancelled && !pointRef.current) map.jumpTo({ center: [lng, lat], zoom: POINT_ZOOM });
        })
        .catch(() => {});
    }

    return () => {
      cancelled = true;
      marker.remove();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [webgl, setPoint]);

  const outside = point && !insideCoverage(point);

  return (
    <div
      role="dialog"
      aria-label="Pick the location on the map"
      data-testid="pick-location"
      className="fixed inset-x-0 top-[5.25rem] bottom-24 z-50 flex flex-col overflow-hidden bg-surface md:inset-x-auto md:top-1/2 md:bottom-auto md:left-1/2 md:h-[min(80vh,640px)] md:w-[min(92vw,720px)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl md:border md:border-line-strong md:shadow-card-hover"
    >
      <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
        <h2 className="font-display text-lg font-bold">Pick the location</h2>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close the map"
          className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-line-strong bg-white/5 transition-colors hover:bg-white/10"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>

      <div className="rn-map relative min-h-0 flex-1 border-y border-line bg-surface">
        {/* Same wrapper pattern as MapView and IncidentMiniMap: MapLibre's CSS makes its container
            position: relative, so the wrapper positions and the container fills it. */}
        <div className="absolute inset-0">
          <div ref={containerRef} data-testid="pick-map" className="size-full" />
        </div>
        {!webgl && (
          <p className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-ink-muted">
            This browser can&apos;t draw the map. Use your location or type the coordinates instead.
          </p>
        )}
        {webgl && !point && (
          <p className="pointer-events-none absolute inset-x-3 top-3 rounded-xl border border-line-strong bg-surface-raised/90 px-3 py-2 text-xs font-semibold backdrop-blur-xl">
            Tap the map to place the pin. Drag the pin to adjust it.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2 px-4 pt-3 pb-3">
        {outside && (
          <p data-testid="pick-outside" className="flex items-start gap-2 text-xs font-medium text-warn">
            <MapPinOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Outside the offline map area (Chandigarh, Mohali, Panchkula). You can still use this point.
          </p>
        )}
        <p data-testid="pick-coords" aria-live="polite" className="text-sm text-ink-muted tabular-nums">
          {point ? `Latitude ${point.lat.toFixed(6)}, longitude ${point.lng.toFixed(6)}` : "No point chosen yet"}
        </p>
        <button
          type="button"
          disabled={!point}
          onClick={() => {
            if (point) onUse(point);
          }}
          className="flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-brand-gradient px-4 py-2.5 text-sm font-bold text-on-brand shadow-brand transition-all duration-150 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 motion-safe:active:scale-95"
        >
          <MapPin className="size-4" aria-hidden="true" />
          Use this location
        </button>
      </div>
    </div>
  );
}
