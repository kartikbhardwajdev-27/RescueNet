"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import "./map.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { LngLatBounds, Map as MapLibreMap, Marker, NavigationControl, Popup } from "maplibre-gl";
import Card from "@/components/Card";
import { useToast } from "@/components/SosProvider";
import { oldestSavedAt } from "@/components/SavedDataBanner";
import usePolledResource from "@/components/usePolledResource";
import useUserLocation from "@/components/useUserLocation";
import NavigationBottom from "@/components/navigation/NavigationBottom";
import NavigationPanel from "@/components/navigation/NavigationPanel";
import NavigationTop from "@/components/navigation/NavigationTop";
import { ensureRouteLayers, showRoute, showZones } from "@/components/navigation/routeLayers";
import useNavigation from "@/components/navigation/useNavigation";
import { fetchIncidents, fetchShelters } from "@/lib/api";
import { describeLocationError, formatDistance, getCurrentLocation } from "@/lib/geo";
import { parseFocus, parseNavigate } from "@/lib/mapFocus";
import { limitPadding, safeFitBounds } from "@/lib/mapFraming";
import { shelterWarnings } from "@/lib/nearest";
import { getRoutingClient } from "@/lib/routing/client";
import { zonesFromIncidents } from "@/lib/routing/zones";
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

// Fitting a whole road route in view: the top and bottom are the real heights of the instruction
// card and the strip (measured when it is framed, see framingPadding); these are the sides.
const ROUTE_PADDING = {
  compact: { top: 100, bottom: 130, left: 40, right: 40 },
  wide: { top: 100, bottom: 130, left: 100, right: 100 },
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
  const navigateRaw = parseNavigate(searchParams.get("navigate"))?.raw ?? null;
  const navigateId = parseNavigate(searchParams.get("navigate"))?.id ?? null;
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
  const autoNavigateRef = useRef(null); // the /map?navigate= link that has been acted on
  const routeFitRef = useRef(null); // the navigation request the camera already framed
  const cameraFollowsRef = useRef(true); // "Start" keeps the person in view until the map is dragged
  const [cameraPaused, setCameraPaused] = useState(false);
  // The directions sheet is open for this request id (so it starts closed for every new request).
  const [sheetFor, setSheetFor] = useState(null);

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

  // ---- road directions to a shelter (and the straight-line fallback) ----

  const navigation = useNavigation({ device, shelters: shelters.data, incidents: incidents.data });
  // The straight-line guidance, only when road directions are not possible.
  const guidance = navigation.fallbackGuidance;
  // A road route is on screen: the instruction card and the bottom strip replace the filters,
  // the legend and the "Navigate to nearest shelter" button.
  const routeOn = navigation.route !== null;
  const sheetOpen = routeOn && sheetFor !== null && sheetFor === navigation.request?.id;
  const toggleSheet = useCallback(() => setSheetFor((current) => (current !== null && current === navigation.request?.id ? null : (navigation.request?.id ?? null))), [navigation.request?.id]);
  const warnings = useMemo(() => shelterWarnings(shelterList, incidents.data ?? []), [shelterList, incidents.data]);
  const guidanceFrom = guidance?.from ?? null;
  const guidanceTarget = guidance?.target ?? null;
  const guidanceTargetId = guidance?.shelter._id ?? null;
  const guidanceSaved = guidance?.source === "saved";
  const guidanceLabel = guidance ? `${formatDistance(guidance.distanceKm)}${guidance.direction ? ` ${guidance.direction}` : ""}` : null;

  // Room to keep clear of the panels when framing something. While a route is on screen the top and
  // bottom are the real heights of the instruction card and the strip (with room for the banner and
  // the round button); always capped, because a small phone has little map to spare.
  const framingPadding = useCallback((base) => {
    const card = containerRef.current.closest(".rn-map") ?? containerRef.current;
    const instruction = card.querySelector("[data-nav=instruction]")?.offsetHeight;
    const strip = card.querySelector("[data-nav=strip]")?.offsetHeight;
    return limitPadding(
      { top: instruction !== undefined ? instruction + 44 : base.top, bottom: strip !== undefined ? strip + 70 : base.bottom, left: base.left, right: base.right },
      card.clientWidth,
      card.clientHeight,
    );
  }, []);

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
      // Not compact: the OpenStreetMap credit must be readable, not tucked behind a button.
      attributionControl: { compact: false },
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
      if (!event.originalEvent) return;
      userMovedRef.current = true;
      // Dragging the map while "Start" follows the person stops the camera following.
      cameraFollowsRef.current = false;
      setCameraPaused(true);
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

  // The person's own position: the live one while "Start" is following them.
  const liveLng = navigation.liveFix?.lon ?? null;
  const liveLat = navigation.liveFix?.lat ?? null;
  const shownLng = liveLng ?? deviceLng;
  const shownLat = liveLng === null ? deviceLat : liveLat;
  useEffect(() => {
    if (!mapInstance || shownLng === null) return;
    const marker = new Marker({ element: createUserMarker() }).setLngLat([shownLng, shownLat]).addTo(mapInstance);
    return () => marker.remove();
  }, [mapInstance, shownLng, shownLat]);

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

  // ---- the road route ----

  useEffect(() => {
    if (mapInstance) ensureRouteLayers(mapInstance);
  }, [mapInstance]);

  const navRoute = navigation.route;
  const navSteps = navigation.steps;
  const followStep = navigation.following ? (navigation.progress?.stepIndex ?? 0) : null;
  const stepStart = followStep !== null && navSteps ? navSteps[followStep].startIndex : null;
  const stepEnd = followStep !== null && navSteps ? navSteps[followStep].endIndex : null;
  useEffect(() => {
    if (mapInstance) showRoute(mapInstance, navRoute, stepStart === null ? null : [stepStart, stepEnd]);
  }, [mapInstance, navRoute, stepStart, stepEnd]);

  // The danger zones the route steers round, drawn while directions are on screen.
  const navActive = navigation.request !== null;
  const zones = useMemo(() => (navActive ? zonesFromIncidents(incidents.data) : []), [navActive, incidents.data]);
  useEffect(() => {
    if (mapInstance) showZones(mapInstance, zones);
  }, [mapInstance, zones]);

  // Frame the whole route once per press of a button and per change of Walk/Drive.
  const fitKey = navigation.fitKey;
  const navProfile = navigation.profile;
  const following = navigation.following;
  useEffect(() => {
    if (!navRoute) {
      routeFitRef.current = null;
      return;
    }
    if (!mapInstance || routeFitRef.current === fitKey || following || navRoute.profile !== navProfile) return;
    routeFitRef.current = fitKey;
    const compact = containerRef.current.clientWidth < COMPACT_WIDTH;
    const first = navRoute.coordinates[0];
    const bounds = navRoute.coordinates.reduce((box, point) => box.extend(point), new LngLatBounds(first, first));
    safeFitBounds(mapInstance, bounds, { padding: framingPadding(compact ? ROUTE_PADDING.compact : ROUTE_PADDING.wide), maxZoom: FOCUS_ZOOM + 1, duration: 700 });
  }, [mapInstance, navRoute, fitKey, navProfile, following, framingPadding]);

  // "Start": keep the person in view as they move, until they drag the map.
  useEffect(() => {
    if (!mapInstance || liveLng === null || !cameraFollowsRef.current) return;
    mapInstance.easeTo({ center: [liveLng, liveLat], zoom: Math.max(mapInstance.getZoom(), 16), duration: 700 });
  }, [mapInstance, liveLng, liveLat]);

  // Save the road data on this device while there is a connection, so directions work
  // later with none. Cheap when it is already saved.
  useEffect(() => {
    if (mapInstance) getRoutingClient().warm().catch(() => {});
  }, [mapInstance]);

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

  // A ring on the shelter the directions (or the straight line) lead to.
  const ringId = navigation.route ? (navigation.destination?._id ?? null) : guidanceTargetId;
  useEffect(() => {
    for (const [key, { marker }] of markersRef.current) {
      marker.getElement().classList.toggle("is-nearest", ringId !== null && key === `shelter:${ringId}`);
    }
  }, [mapInstance, markerItems, ringId]);

  // Show the person and the shelter together: once per press of the button, not
  // on every 30-second refresh.
  const requestId = navigation.request?.id ?? null;
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
    safeFitBounds(mapInstance, bounds, {
      padding: framingPadding(compact ? GUIDANCE_PADDING.compact : GUIDANCE_PADDING.wide),
      maxZoom: FOCUS_ZOOM,
      duration: 700,
    });
  }, [mapInstance, guidance, requestId, framingPadding]);

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
    safeFitBounds(mapInstance, bounds, {
      padding: framingPadding(compact ? FIT_PADDING.compact : FIT_PADDING.wide),
      maxZoom: FIT_MAX_ZOOM,
      duration: 700,
    });
  }, [mapInstance, dataReady, focusRaw, focusKind, focusId, incidentsLoaded, sheltersLoaded, activeIncidents, shelterList, showToast, framingPadding]);

  // /map?nearest=1 (from the Shelters page) asks for directions to the nearest shelter once
  // the data is in; /map?navigate=shelter:<id> (the Navigate button on a shelter card) to that one.
  const { startNearest, startTo } = navigation;
  useEffect(() => {
    if (!autoNearest || autoNearestRef.current || !mapInstance || !dataReady) return;
    autoNearestRef.current = true;
    startNearest();
  }, [autoNearest, mapInstance, dataReady, startNearest]);

  useEffect(() => {
    if (!navigateRaw || autoNavigateRef.current === navigateRaw || !mapInstance || !dataReady) return;
    autoNavigateRef.current = navigateRaw;
    const shelter = shelterList.find((record) => record._id === navigateId);
    if (shelter) startTo(shelter);
    else if (sheltersLoaded) showToast("That shelter isn't on the map any more", { kind: "error" });
  }, [navigateRaw, navigateId, mapInstance, dataReady, shelterList, sheltersLoaded, startTo, showToast]);

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
    startNearest();
  }, [shelters.data, startNearest, showToast]);

  // "Start" in the directions panel: follow the person, with the camera on them.
  const handleStartFollowing = useCallback(() => {
    cameraFollowsRef.current = true;
    setCameraPaused(false);
    navigation.startFollowing();
  }, [navigation]);

  const recentre = useCallback(() => {
    cameraFollowsRef.current = true;
    setCameraPaused(false);
    if (mapInstance && liveLng !== null) mapInstance.easeTo({ center: [liveLng, liveLat], zoom: Math.max(mapInstance.getZoom(), 16), duration: 500 });
  }, [mapInstance, liveLng, liveLat]);

  // The one round button: "My location", which becomes "Re-centre on me" while "Start" is following the
  // person and they have dragged the map away.
  const handleRoundLocate = useCallback(() => {
    if (navigation.following && liveLng !== null) recentre();
    else handleLocate();
  }, [navigation.following, liveLng, recentre, handleLocate]);
  const locateLabel = navigation.following && cameraPaused ? "Re-centre on me" : "My location";

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
  const nav = { ...navigation, startFollowing: handleStartFollowing };

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
            savedAt={oldestSavedAt(incidents, shelters)}
            hero={routeOn ? <NavigationTop nav={nav} onOpenDirections={() => !sheetOpen && toggleSheet()} /> : null}
          >
            <NavigationPanel nav={nav} incidentsKnown={incidents.data !== null} onShowShelter={(id) => setSelected({ kind: "shelter", id })} />
          </TopNotices>
          {noData && (
            <LoadFailed message={incidents.error ?? shelters.error} onRetry={retry([incidents, shelters])} />
          )}
          {routeOn ? (
            <NavigationBottom
              nav={nav}
              open={sheetOpen}
              onToggle={toggleSheet}
              onLocate={handleRoundLocate}
              locateLabel={locateLabel}
              locating={locating}
              destinationLabel={navigation.destination?.name ?? "Shelter"}
              destinationWarning={navigation.destination ? warnings.get(navigation.destination._id) : undefined}
              incidentsKnown={incidents.data !== null}
              onShowDetails={navigation.destination ? () => { setSheetFor(null); setSelected({ kind: "shelter", id: navigation.destination._id }); } : undefined}
              detailsLabel="Shelter details"
            />
          ) : (
            <BottomControls
              filters={filters}
              counts={counts}
              onToggle={toggleFilter}
              onLocate={handleRoundLocate}
              locating={locating}
              locateLabel={locateLabel}
              onNearest={handleNearest}
              findingNearest={navigation.busy}
              nearestEnabled={Boolean(shelters.data)}
            />
          )}
        </>
      )}

      {selectedRecord &&
        createPortal(
          <PopupCard
            kind={selected.kind}
            record={selectedRecord}
            warning={selected.kind === "shelter" ? warnings.get(selected.id) : undefined}
            now={popupSource.fetchedAt ?? 0}
            onNavigate={
              selected.kind === "shelter"
                ? () => {
                    setSelected(null);
                    navigation.startTo(selectedRecord);
                  }
                : undefined
            }
            onClose={closeSelected}
          />,
          popupEl,
        )}
    </Card>
  );
}
