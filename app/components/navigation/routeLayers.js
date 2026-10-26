// The road route, the step the person is on, and the danger zones, as MapLibre
// sources and layers. MapView adds them once the style is ready (`ensureRouteLayers`)
// and then only updates their data (`showRoute`, `showZones`). They go away with the
// map, so there is nothing to clean up.
//
// Colours follow the app's meaning: blue = information (the route), amber = warning
// (the danger zones), green = safe (the shelter, drawn by its marker).

import { circlePolygon } from "@/lib/routing/navigation";

export const ROUTE_SOURCE = "nav-route";
export const STEP_SOURCE = "nav-route-step";
export const ZONES_SOURCE = "nav-zones";

const EMPTY = { type: "FeatureCollection", features: [] };

export function ensureRouteLayers(map) {
  if (map.getSource(ROUTE_SOURCE)) return;
  map.addSource(ZONES_SOURCE, { type: "geojson", data: EMPTY });
  map.addSource(ROUTE_SOURCE, { type: "geojson", data: EMPTY });
  map.addSource(STEP_SOURCE, { type: "geojson", data: EMPTY });

  map.addLayer({ id: `${ZONES_SOURCE}-fill`, type: "fill", source: ZONES_SOURCE, paint: { "fill-color": "#fbbf24", "fill-opacity": 0.16 } });
  map.addLayer({
    id: `${ZONES_SOURCE}-line`,
    type: "line",
    source: ZONES_SOURCE,
    paint: { "line-color": "#fbbf24", "line-width": 2, "line-dasharray": [2, 1.5], "line-opacity": 0.9 },
  });
  // A dark band under the route keeps it readable over roads and parks.
  map.addLayer({
    id: `${ROUTE_SOURCE}-casing`,
    type: "line",
    source: ROUTE_SOURCE,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#000000", "line-opacity": 0.6, "line-width": 9 },
  });
  map.addLayer({
    id: ROUTE_SOURCE,
    type: "line",
    source: ROUTE_SOURCE,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#60a5fa", "line-width": 5.5 },
  });
  map.addLayer({
    id: STEP_SOURCE,
    type: "line",
    source: STEP_SOURCE,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#ffffff", "line-width": 3 },
  });
}

const line = (coordinates) => (coordinates.length > 1 ? { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } } : EMPTY);

// route: the engine's result (or null to clear); stepRange: [startIndex, endIndex] of
// the step to highlight (or null).
export function showRoute(map, route, stepRange = null) {
  map.getSource(ROUTE_SOURCE)?.setData(route ? line(route.coordinates) : EMPTY);
  map.getSource(STEP_SOURCE)?.setData(route && stepRange ? line(route.coordinates.slice(stepRange[0], stepRange[1] + 1)) : EMPTY);
}

// zones: [{ id, lat, lon, radiusM }]
export function showZones(map, zones) {
  map.getSource(ZONES_SOURCE)?.setData({
    type: "FeatureCollection",
    features: zones.map((zone) => ({
      type: "Feature",
      properties: { id: zone.id },
      geometry: { type: "Polygon", coordinates: [circlePolygon(zone.lat, zone.lon, zone.radiusM)] },
    })),
  });
}
