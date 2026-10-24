"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import "./map.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { LngLatBounds, Map as MapLibreMap, Marker, NavigationControl, Popup } from "maplibre-gl";
import Card from "@/components/Card";
import { useToast } from "@/components/SosProvider";
import usePolledResource from "@/components/usePolledResource";
import useNearestShelter from "@/components/useNearestShelter";
import useUserLocation from "@/components/useUserLocation";
import NearestPanel, { nearestPanelButtonClass } from "@/components/shelters/NearestPanel";
import { fetchIncidents, fetchShelters } from "@/lib/api";
import { describeLocationError, formatDistance, getCurrentLocation } from "@/lib/geo";
import { parseFocus } from "@/lib/mapFocus";
import { shelterWarnings } from "@/lib/nearest";
import { BottomControls, LoadFailed, MapUnavailable, TopNotices } from "./MapOverlays";
import PopupCard from "./PopupCard";
import {
  buildStyle,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  FIT_MAX_ZOOM,
  FOCUS_ZOOM,
  insideCoverage,
  MAX_ZOOM,
  NEAREST_LAYER,
  NEAREST_SOURCE,
  SOURCE_ID,
} from "./mapConfig";
import { MAP_CARD_SIZE } from "./mapLayout";
import { setupMapRuntime } from "./mapRuntime";
import { webglAvailable } from "./webgl";
import { createIncidentMarker, createShelterMarker, createUserMarker, markerSignature, pointOf } from "./markers";

const COMPACT_WIDTH = 768; // Tailwind's md: the layout below it is the phone layout

// Room kept clear of the overlay panels when fitting the camera: on a phone the
// controls stack up from the bottom edge, from md up they are low and slim.
const FIT_PADDING = {
  compact: { top: 72, bottom: 210, left: 40, right: 40 },
  wide: { top: 72, bottom: 120, left: 80, right: 80 },
};

// Fitting the person and the nearest shelter in view: more room at the top for
// the guidance panel, and at the bottom for the controls.
const GUIDANCE_PADDING = {
  compact: { top: 210, bottom: 230, left: 40, right: 40 },
  wide: { top: 190, bottom: 130, left: 100, right: 100 },
};

const EMPTY_LINE = { type: "FeatureCollection", features: [] };

const hasSettled = (resource) => !(resource.loading && !resource.data);

// The live map: the Protomaps dark basemap read from a local file, with the
// incidents and shelters from the API on top. Client-only (see MapLoader).
//
// React owns the data, filters and selection. MapLibre owns the camera and the
// marker positions. Each effect below keeps one piece of the map in step with
// state: markers follow the filtered data, the popup follows the selection, the
// blue dot follows the person's position.
export default function MapView() {
  const incidents = usePolledResource(fetchIncidents);
  const shelters = usePolledResource(fetchShelters);
  const place = useUserLocation();
  const showToast = useToast();

  const searchParams = useSearchParams();
  const focus = parseFocus(searchParams.get("focus"));
  const autoNearest = searchParams.get("nearest") === "1";
  const focusRaw = focus?.raw ?? null;
  const focusKind = focus?.kind ?? null;
  const focusId = focus?.id ?? null;

  const [webgl] = useState(webglAvailable);
  const [popupEl] = useState(() => document.createElement("div"));
  const [mapInstance, setMapInstance] = useState(null);
  const [filters, setFilters] = useState({ incidents: true, shelters: true });
  const [selected, setSelected] = useState(null); // { kind, id } or null
  const [baseMapMissing, setBaseMapMissing] = useState(false);
  const [outsideCoverage, setOutsideCoverage] = useState(false);
  const [fix, setFix] = useState(null); // a position from pressing "My location"
  const [locating, setLocating] = useState(false);

  const containerRef = useRef(null);
  const popupRef = useRef(null);
  const markersRef = useRef(new Map()); // "kind:id" -> { marker, signature }
  const userMovedRef = useRef(false); // the person has moved the map themselves
  const cameraDoneRef = useRef(null); // which camera move (focus link or fit) already ran
  const guidanceFitRef = useRef(null); // the "Nearest shelter" request the camera already moved for
  const autoNearestRef = useRef(false); // /map?nearest=1 has been acted on

  // ---- data ----

  // Resolved incidents are no longer a hazard, so they are left off (the Home
  // map does the same). Shelters of every status stay; the popup shows which.
  const activeIncidents = useMemo(() => (incidents.data ?? []).filter((i) => i.status !== "resolved"), [incidents.data]);
  const shelterList = useMemo(() => shelters.data ?? [], [shelters.data]);

  const markerItems = useMemo(
    () => [
      ...(filters.incidents ? activeIncidents.map((record) => ({ kind: "incident", id: record._id, record })) : []),
      ...(filters.shelters ? shelterList.map((record) => ({ kind: "shelter", id: record._id, record })) : []),
    ],
    [filters, activeIncidents, shelterList],
  );

  const selectedRecord = useMemo(() => {
    if (!selected) return null;
    const list = selected.kind === "incident" ? activeIncidents : shelterList;
    return list.find((record) => record._id === selected.id) ?? null;
  }, [selected, activeIncidents, shelterList]);
  const selectedPoint = selectedRecord ? pointOf(selectedRecord) : null;
  const selectedLng = selectedPoint?.[0] ?? null;
  const selectedLat = selectedPoint?.[1] ?? null;

  const device = fix ?? (place.source === "device" ? place.location : null);
  const deviceLng = device?.lng ?? null;
  const deviceLat = device?.lat ?? null;

  // ---- nearest shelter ----

  const nearest = useNearestShelter({ device, shelters: shelters.data, incidents: incidents.data });
  const { guidance } = nearest;
  const warnings = useMemo(() => shelterWarnings(shelterList, incidents.data ?? []), [shelterList, incidents.data]);
  const guidanceFrom = guidance?.from ?? null;
  const guidanceTarget = guidance?.target ?? null;
  const guidanceTargetId = guidance?.shelter._id ?? null;
  const guidanceSaved = guidance?.source === "saved";
  const guidanceLabel = guidance ? `${formatDistance(guidance.distanceKm)}${guidance.direction ? ` ${guidance.direction}` : ""}` : null;

  // ---- the map ----

  useEffect(() => {
    if (!webgl) return;
    setupMapRuntime();

    const map = new MapLibreMap({
      container: containerRef.current,
      style: buildStyle(window.location.origin),
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      maxZoom: MAX_ZOOM,
      attributionControl: { compact: true },
      renderWorldCopies: false,
      // North stays up: rotating and tilting only disorient on a rescue map.
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");

    let disposed = false;
    // style.load, not load: `load` waits for every source, so it never fires if
    // the .pmtiles file is missing, and the markers would never appear either.
    map.once("style.load", () => {
      if (!disposed) setMapInstance(map);
    });
    map.on("movestart", (event) => {
      if (event.originalEvent) userMovedRef.current = true;
    });
    map.on("moveend", () => setOutsideCoverage(!insideCoverage(map.getCenter())));
    map.on("error", (event) => {
      if (event.sourceId === SOURCE_ID && event.error?.name !== "AbortError") setBaseMapMissing(true);
    });

    const markers = markersRef.current;
    return () => {
      disposed = true;
      for (const { marker } of markers.values()) marker.remove();
      markers.clear();
      map.remove();
      setMapInstance(null);
    };
  }, [webgl]);

  // One popup, moved between items. Closing it any way (X, map click) clears the selection.
  useEffect(() => {
    if (!mapInstance) return;
    const popup = new Popup({ closeButton: false, closeOnClick: true, offset: 24, maxWidth: "none" });
    popup.setDOMContent(popupEl);
    const handleClose = () => setSelected(null);
    popup.on("close", handleClose);
    popupRef.current = popup;
    return () => {
      popup.off("close", handleClose);
      popup.remove();
      popupRef.current = null;
    };
  }, [mapInstance, popupEl]);

  useEffect(() => {
    const popup = popupRef.current;
    if (!popup || !mapInstance) return;
    if (selectedLng === null) {
      popup.remove();
      return;
    }
    popup.setLngLat([selectedLng, selectedLat]);
    if (!popup.isOpen()) popup.addTo(mapInstance);
  }, [mapInstance, selectedLng, selectedLat]);

  // Markers: add new ones, rebuild changed ones, remove the rest. A refresh with
  // identical data touches nothing, so nothing flickers every 30 seconds.
  useEffect(() => {
    if (!mapInstance) return;
    const markers = markersRef.current;
    const wanted = new Set();

    for (const { kind, id, record } of markerItems) {
      const key = `${kind}:${id}`;
      const signature = markerSignature(kind, record);
      wanted.add(key);
      if (markers.get(key)?.signature === signature) continue;

      markers.get(key)?.marker.remove();
      const element = kind === "incident" ? createIncidentMarker(record) : createShelterMarker(record);
      const label = element.getAttribute("aria-label");
      element.addEventListener("click", (event) => {
        // Otherwise the map sees this as a click on empty ground and closes the popup.
        event.stopPropagation();
        setSelected({ kind, id });
      });
      const marker = new Marker({ element }).setLngLat(pointOf(record)).addTo(mapInstance);
      // Marker may set its own generic label; ours says what this one is.
      element.setAttribute("aria-label", label);
      markers.set(key, { marker, signature });
    }

    for (const [key, { marker }] of markers) {
      if (wanted.has(key)) continue;
      marker.remove();
      markers.delete(key);
    }
  }, [mapInstance, markerItems]);

  // The person's own position.
  useEffect(() => {
    if (!mapInstance || deviceLng === null) return;
    const marker = new Marker({ element: createUserMarker() }).setLngLat([deviceLng, deviceLat]).addTo(mapInstance);
    return () => marker.remove();
  }, [mapInstance, deviceLng, deviceLat]);

  // The dashed straight line from the person to the nearest shelter. The source
  // and layers are added once the style is ready; the line itself follows the
  // guidance. (They go away with the map, so there is nothing to clean up.)
  useEffect(() => {
    if (!mapInstance || mapInstance.getSource(NEAREST_SOURCE)) return;
    mapInstance.addSource(NEAREST_SOURCE, { type: "geojson", data: EMPTY_LINE });
    // A dark band under the dashes keeps them readable over roads and parks.
    mapInstance.addLayer({
      id: `${NEAREST_LAYER}-casing`,
      type: "line",
      source: NEAREST_SOURCE,
      paint: { "line-color": "#000000", "line-opacity": 0.55, "line-width": 7 },
    });
    mapInstance.addLayer({
      id: NEAREST_LAYER,
      type: "line",
      source: NEAREST_SOURCE,
      layout: { "line-cap": "butt", "line-join": "round" },
      paint: { "line-color": "#34d399", "line-width": 4, "line-dasharray": [1.4, 1.1] },
    });
  }, [mapInstance]);

  useEffect(() => {
    const source = mapInstance?.getSource(NEAREST_SOURCE);
    if (!source) return;
    source.setData(
      guidance ? { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: guidance.line } } : EMPTY_LINE,
    );
  }, [mapInstance, guidance]);

  // "850 m SW" half way along the line, and a marker for a saved location (the
  // blue dot only ever shows a position the browser gave us).
  const midLng = guidanceFrom && guidanceTarget ? (guidanceFrom.lng + guidanceTarget.lng) / 2 : null;
  const midLat = guidanceFrom && guidanceTarget ? (guidanceFrom.lat + guidanceTarget.lat) / 2 : null;
  useEffect(() => {
    if (!mapInstance || midLng === null) return;
    const label = document.createElement("div");
    label.className = "rn-line-label";
    label.textContent = guidanceLabel;
    label.setAttribute("aria-hidden", "true");
    const marker = new Marker({ element: label }).setLngLat([midLng, midLat]).addTo(mapInstance);
    return () => marker.remove();
  }, [mapInstance, midLng, midLat, guidanceLabel]);

  const fromLng = guidanceFrom?.lng ?? null;
  const fromLat = guidanceFrom?.lat ?? null;
  useEffect(() => {
    if (!mapInstance || fromLng === null || !guidanceSaved) return;
    const element = createUserMarker();
    element.setAttribute("aria-label", "Your saved location");
    const marker = new Marker({ element }).setLngLat([fromLng, fromLat]).addTo(mapInstance);
    return () => marker.remove();
  }, [mapInstance, fromLng, fromLat, guidanceSaved]);

  // A ring on the recommended shelter's marker.
  useEffect(() => {
    for (const [key, { marker }] of markersRef.current) {
      marker.getElement().classList.toggle("is-nearest", guidanceTargetId !== null && key === `shelter:${guidanceTargetId}`);
    }
  }, [mapInstance, markerItems, guidanceTargetId]);

  // Show the person and the shelter together: once per press of the button, not
  // on every 30-second refresh.
  const requestId = nearest.request?.id ?? null;
  useEffect(() => {
    if (!mapInstance || !guidance) {
      if (!guidance) guidanceFitRef.current = null;
      return;
    }
    if (guidanceFitRef.current === requestId) return;
    guidanceFitRef.current = requestId;
    const compact = containerRef.current.clientWidth < COMPACT_WIDTH;
    const bounds = new LngLatBounds([guidance.from.lng, guidance.from.lat], [guidance.from.lng, guidance.from.lat]).extend([
      guidance.target.lng,
      guidance.target.lat,
    ]);
    mapInstance.fitBounds(bounds, {
      padding: compact ? GUIDANCE_PADDING.compact : GUIDANCE_PADDING.wide,
      maxZoom: FOCUS_ZOOM,
      duration: 700,
    });
  }, [mapInstance, guidance, requestId]);

  // ---- camera: a deep link, else fit the data ----

  const dataReady = hasSettled(incidents) && hasSettled(shelters);
  const incidentsLoaded = Boolean(incidents.data);
  const sheltersLoaded = Boolean(shelters.data);

  useEffect(() => {
    if (!mapInstance || !dataReady) return;
    const move = focusRaw ?? "fit";
    if (cameraDoneRef.current === move) return;
    cameraDoneRef.current = move;

    const compact = containerRef.current.clientWidth < COMPACT_WIDTH;

    if (focusKind) {
      const target = (focusKind === "incident" ? activeIncidents : shelterList).find((record) => record._id === focusId);
      if (target) {
        const [lng, lat] = pointOf(target);
        // Open the popup once the camera has arrived. Shifting the target below
        // centre leaves the popup, which opens above it, room on a short screen.
        mapInstance.once("moveend", () => setSelected({ kind: focusKind, id: focusId }));
        mapInstance.flyTo({ center: [lng, lat], zoom: FOCUS_ZOOM, offset: [0, Math.round(mapInstance.getContainer().clientHeight * 0.18)] });
        return;
      }
      // Say so only when we did get the list: a failed request has its own notice.
      if (focusKind === "incident" ? incidentsLoaded : sheltersLoaded) showToast(`That ${focusKind} isn't on the map any more`, { kind: "error" });
    }

    // Fit everything, unless the person is already moving the map themselves.
    const points = [...activeIncidents, ...shelterList].map(pointOf);
    if (points.length === 0 || userMovedRef.current) return;
    const bounds = points.reduce((box, point) => box.extend(point), new LngLatBounds(points[0], points[0]));
    mapInstance.fitBounds(bounds, {
      padding: compact ? FIT_PADDING.compact : FIT_PADDING.wide,
      maxZoom: FIT_MAX_ZOOM,
      duration: 700,
    });
  }, [mapInstance, dataReady, focusRaw, focusKind, focusId, incidentsLoaded, sheltersLoaded, activeIncidents, shelterList, showToast]);

  // /map?nearest=1 (from the Shelters page) asks for the nearest shelter once the data is in.
  const { find: findNearest } = nearest;
  useEffect(() => {
    if (!autoNearest || autoNearestRef.current || !mapInstance || !dataReady) return;
    autoNearestRef.current = true;
    findNearest();
  }, [autoNearest, mapInstance, dataReady, findNearest]);

  // ---- controls ----

  // Closing from the popup itself (X button or Escape) hands focus back to the
  // marker that opened it, so keyboard users keep their place on the map.
  const closeSelected = useCallback(() => {
    if (!selected) return;
    const entry = markersRef.current.get(`${selected.kind}:${selected.id}`);
    setSelected(null);
    entry?.marker.getElement().focus();
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") closeSelected();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selected, closeSelected]);

  const toggleFilter = useCallback((key) => {
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }));
    // A popup for something that is about to disappear closes with it.
    setSelected((prev) => (prev && prev.kind === (key === "incidents" ? "incident" : "shelter") ? null : prev));
  }, []);

  const flyToPerson = useCallback(
    (point) => mapInstance.flyTo({ center: [point.lng, point.lat], zoom: Math.max(mapInstance.getZoom(), 14) }),
    [mapInstance],
  );

  const handleLocate = useCallback(async () => {
    if (!mapInstance) return;
    if (device) {
      flyToPerson(device);
      return;
    }
    setLocating(true);
    try {
      const point = await getCurrentLocation();
      setFix({ lng: point.lng, lat: point.lat });
      flyToPerson(point);
    } catch (err) {
      showToast(describeLocationError(err.code), { kind: "error", duration: 6000 });
    } finally {
      setLocating(false);
    }
  }, [mapInstance, device, flyToPerson, showToast]);

  const handleNearest = useCallback(() => {
    if (!shelters.data) {
      showToast("Shelters are still loading. Try again in a moment.", { kind: "error" });
      return;
    }
    setSelected(null);
    findNearest();
  }, [shelters.data, findNearest, showToast]);

  const retry = useCallback(
    (resources) => () => {
      for (const resource of resources) resource.refresh();
    },
    [],
  );

  // ---- what to tell the person ----

  const waiting = !dataReady;
  const noData = dataReady && !incidents.data && !shelters.data;
  const failing = [
    ["incidents", incidents],
    ["shelters", shelters],
  ].filter(([, resource]) => resource.error);
  const problem =
    !noData && failing.length > 0
      ? {
          text: `Couldn't ${failing.every(([, resource]) => resource.data) ? "refresh" : "load"} ${failing.map(([name]) => name).join(" and ")}. Showing what we have.`,
          onRetry: retry(failing.map(([, resource]) => resource)),
        }
      : null;
  const empty = dataReady && !noData && !problem && activeIncidents.length + shelterList.length === 0;

  const counts = {
    incidents: incidents.data ? activeIncidents.length : null,
    shelters: shelters.data ? shelterList.length : null,
  };

  const popupSource = selected?.kind === "incident" ? incidents : shelters;

  return (
    <Card padded={false} lift={false} className={`rn-map relative overflow-hidden ${MAP_CARD_SIZE}`}>
      {/* MapLibre's own CSS (unlayered, so it beats Tailwind's layered utilities)
          sets position: relative on its container. The wrapper does the absolute
          positioning; the container just fills it. */}
      <div className="absolute inset-0">
        <div ref={containerRef} className="size-full" />
      </div>

      {!webgl && <MapUnavailable message="This browser can't draw maps (WebGL is turned off or unsupported)." />}
      {webgl && !mapInstance && (
        <div aria-hidden="true" className="absolute inset-0 grid place-items-center bg-surface">
          <p className="text-sm font-semibold text-ink-muted motion-safe:animate-pulse">Loading map…</p>
        </div>
      )}

      {webgl && (
        <>
          <TopNotices
            loading={waiting}
            problem={problem}
            baseMapMissing={baseMapMissing}
            outsideCoverage={outsideCoverage}
            empty={empty}
          >
            <NearestPanel
              request={nearest.request}
              guidance={guidance}
              incidentsKnown={nearest.incidentsKnown}
              onClear={nearest.clear}
              onRetry={nearest.find}
            >
              {guidance && (
                <button type="button" onClick={() => setSelected({ kind: "shelter", id: guidance.shelter._id })} className={nearestPanelButtonClass}>
                  Shelter details
                </button>
              )}
            </NearestPanel>
          </TopNotices>
          {noData && (
            <LoadFailed message={incidents.error ?? shelters.error} onRetry={retry([incidents, shelters])} />
          )}
          <BottomControls
            filters={filters}
            counts={counts}
            onToggle={toggleFilter}
            onLocate={handleLocate}
            locating={locating}
            onNearest={handleNearest}
            findingNearest={nearest.busy}
            nearestEnabled={Boolean(shelters.data)}
          />
        </>
      )}

      {selectedRecord &&
        createPortal(
          <PopupCard
            kind={selected.kind}
            record={selectedRecord}
            warning={selected.kind === "shelter" ? warnings.get(selected.id) : undefined}
            now={popupSource.fetchedAt ?? 0}
            onClose={closeSelected}
          />,
          popupEl,
        )}
    </Card>
  );
}
