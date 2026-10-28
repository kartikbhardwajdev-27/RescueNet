"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { watchDevicePosition } from "@/lib/devicePosition";
import { buildGuidance, guidanceFor, incidentGuidance, resolveStartPoint } from "@/lib/nearest";
import { getRoutingClient } from "@/lib/routing/client";
import { initialRerouteState, nextRerouteState, progressOnRoute } from "@/lib/routing/follow";
import { buildSteps } from "@/lib/routing/instructions";
import {
  incidentDestinationWarnings,
  incidentNeedsConfirmation,
  INCIDENT_ARRIVAL_NAME,
  otherIncidents,
  routeFailureCode,
  routeWarnings,
  routingCandidates,
} from "@/lib/routing/navigation";
import { zonesFromIncidents } from "@/lib/routing/zones";

const PROFILE_KEY = "rescuenet-nav-profile";

// Walking is the default: in an emergency most people leave on foot. The choice is
// remembered on this device (a per-viewer convenience; nothing depends on it).
function readProfile() {
  try {
    return localStorage.getItem(PROFILE_KEY) === "drive" ? "drive" : "walk";
  } catch {
    return "walk";
  }
}

// Road directions to a shelter: from "Navigate to nearest shelter" (mode "nearest") or
// from the "Navigate" button of one shelter (mode "shelter"), or to the nearest road to an
// incident: from "Navigate here" on an incident (mode "incident"). For an incident the route
// stops at the nearest road point (never at the incident itself), its own danger zone is not
// penalised and not warned about (other incidents still count), and a high or critical active
// incident first asks for a confirmation (`pendingConfirm`, `confirmPending`, `cancelPending`).
//
//   device     a location already known ({ lng, lat }) or null
//   shelters   the shelter list, or null while it has not loaded (the saved list in
//              the Android app when the server cannot be reached)
//   incidents  the incident list, or null (likewise)
//
// What it gives back (see NavigationPanel for how it is shown):
//   outcome  null, or { status } where status is
//              "locating"       finding out where the person is
//              "need-location"  no location from the device or the account ({ code })
//              "none"           nearest mode, but no shelter is open with room
//              "gone"           shelter or incident mode, but it is not in the list
//              "fallback"       road directions are not possible ({ code, from, source }):
//                               the screen shows the straight-line guidance instead
//              "ok"             a road route ({ route, steps, from, source, shelterId, tried })
//   route, steps, destination, warnings, progress, fallbackGuidance ...
//
// The work is done in a Web Worker (lib/routing/); nothing here touches the network.
export default function useNavigation({ device, shelters, incidents }) {
  const { user } = useAuth();
  const [savedLng, savedLat] = user?.location?.coordinates ?? [];

  const [profile, setProfileState] = useState(readProfile);
  const [request, setRequest] = useState(null); // { id, mode: "nearest" | "shelter" | "incident", shelterId, incidentId }
  const [pendingConfirm, setPendingConfirm] = useState(null); // an incident waiting for "Continue"
  const [outcome, setOutcome] = useState(null);
  const [computing, setComputing] = useState(false);
  const [following, setFollowing] = useState(false);
  const [arrived, setArrived] = useState(false);
  const [rerouting, setRerouting] = useState(false);
  const [liveFix, setLiveFix] = useState(null);
  const [followError, setFollowError] = useState(null);
  const [progress, setProgress] = useState(null);

  // The latest values, for callbacks that must not change identity (position
  // updates arrive about once a second).
  const latest = useRef({});
  const requestRef = useRef(null);
  const outcomeRef = useRef(null);
  const profileRef = useRef(profile);
  const originRef = useRef(null); // { lat, lon, source } the last route started from
  const pressCounter = useRef(0);
  const computeSerial = useRef(0);
  const segmentRef = useRef(0);
  const rerouteRef = useRef(initialRerouteState());

  useEffect(() => {
    latest.current = { device, shelters, incidents, saved: savedLng === undefined ? null : { lng: savedLng, lat: savedLat } };
    requestRef.current = request;
    outcomeRef.current = outcome;
    profileRef.current = profile;
  });

  // ---- working out a route ----

  const compute = useCallback(async ({ request: asked, from, source, profile: chosen }) => {
    const serial = (computeSerial.current += 1);
    setComputing(true);
    const { shelters: shelterList, incidents: incidentList } = latest.current;
    // A trip to an incident does not avoid (or warn about) that incident's own zone.
    const zones = zonesFromIncidents(asked.mode === "incident" ? otherIncidents(incidentList, asked.incidentId) : incidentList);
    const origin = { lat: from.lat, lon: from.lon };
    const start = { from: { lat: from.lat, lng: from.lon }, source };
    let next;
    try {
      const routing = getRoutingClient();
      if (asked.mode === "nearest") {
        const candidates = routingCandidates(shelterList);
        if (candidates.length === 0) {
          next = { status: "none" };
        } else {
          const found = await routing.routeToNearest({ from: origin, candidates, profile: chosen, zones });
          next =
            found.status === "ok"
              ? { status: "ok", route: found.best.route, shelterId: found.best.candidate.id, tried: found.tried }
              : { status: "fallback", code: routeFailureCode(found) };
        }
      } else if (asked.mode === "incident") {
        const incident = (incidentList ?? []).find((i) => String(i._id) === String(asked.incidentId));
        if (!incident) {
          next = { status: "gone" };
        } else {
          const [lng, lat] = incident.location.coordinates;
          const route = await routing.route({ from: origin, to: { lat, lon: lng }, profile: chosen, zones });
          next = route.status === "ok" ? { status: "ok", route, incidentId: String(incident._id), tried: [] } : { status: "fallback", code: routeFailureCode(route, "incident") };
        }
      } else {
        const shelter = (shelterList ?? []).find((s) => s._id === asked.shelterId);
        if (!shelter) {
          next = { status: "gone" };
        } else {
          const [lng, lat] = shelter.location.coordinates;
          const route = await routing.route({ from: origin, to: { lat, lon: lng }, profile: chosen, zones });
          next = route.status === "ok" ? { status: "ok", route, shelterId: shelter._id, tried: [] } : { status: "fallback", code: routeFailureCode(route) };
        }
      }
    } catch (error) {
      next = { status: "fallback", code: error.code === "graph-missing" || error.code === "graph-corrupt" ? error.code : "failed", detail: error.message };
    }
    if (serial !== computeSerial.current) return null; // a newer question took over
    if (next.status === "ok") {
      const shelter = (shelterList ?? []).find((s) => s._id === next.shelterId);
      const destinationName = asked.mode === "incident" ? INCIDENT_ARRIVAL_NAME : (shelter?.name ?? "the shelter");
      next = { ...next, steps: buildSteps(next.route, { destinationName }), profile: chosen };
    }
    segmentRef.current = 0;
    const settled = { ...next, ...start };
    setOutcome(settled);
    setComputing(false);
    return settled;
  }, []);

  // The person asks for directions. Works out where they are, then the route.
  const begin = useCallback(
    async (asked) => {
      const id = (pressCounter.current += 1);
      const entry = { ...asked, id };
      setRequest(entry);
      setOutcome({ status: "locating" });
      setFollowing(false);
      setArrived(false);
      setProgress(null);
      setFollowError(null);
      const { device: known, saved } = latest.current;
      const found = await resolveStartPoint({ device: known, saved });
      if (pressCounter.current !== id) return; // pressed again, or closed, while waiting for the phone
      if (!found.ok) {
        setOutcome({ status: "need-location", code: found.code });
        return;
      }
      originRef.current = { lat: found.point.lat, lon: found.point.lng, source: found.source };
      await compute({ request: entry, from: { lat: found.point.lat, lon: found.point.lng }, source: found.source, profile: profileRef.current });
    },
    [compute],
  );

  const startNearest = useCallback(() => begin({ mode: "nearest", shelterId: null }), [begin]);
  const startTo = useCallback((shelter) => begin({ mode: "shelter", shelterId: shelter._id }), [begin]);
  const startToIncident = useCallback((incident) => begin({ mode: "incident", incidentId: String(incident._id) }), [begin]);
  // "Navigate here" on an incident: a high or critical active one asks first.
  const askToNavigateToIncident = useCallback(
    (incident) => {
      if (incidentNeedsConfirmation(incident)) setPendingConfirm(incident);
      else startToIncident(incident);
    },
    [startToIncident],
  );
  const confirmPending = useCallback(() => {
    const incident = pendingConfirm;
    setPendingConfirm(null);
    if (incident) startToIncident(incident);
  }, [pendingConfirm, startToIncident]);
  const cancelPending = useCallback(() => setPendingConfirm(null), []);
  const retry = useCallback(() => {
    const asked = requestRef.current;
    if (asked) begin({ mode: asked.mode, shelterId: asked.shelterId, incidentId: asked.incidentId });
  }, [begin]);

  const setProfile = useCallback(
    (next) => {
      if (next !== "walk" && next !== "drive") return;
      try {
        localStorage.setItem(PROFILE_KEY, next);
      } catch {
        // Not remembered; it still changes now.
      }
      setProfileState(next);
      profileRef.current = next;
      const asked = requestRef.current;
      const origin = originRef.current;
      if (asked && origin) compute({ request: asked, from: origin, source: origin.source, profile: next });
    },
    [compute],
  );

  const clear = useCallback(() => {
    pressCounter.current += 1;
    computeSerial.current += 1;
    originRef.current = null;
    setPendingConfirm(null);
    setRequest(null);
    setOutcome(null);
    setComputing(false);
    setFollowing(false);
    setArrived(false);
    setProgress(null);
    setLiveFix(null);
  }, []);

  // Work out the route again when something it depends on changes while it is on
  // screen: a danger zone appears or goes away (a new flood or fire report), or, for
  // "nearest", a shelter fills up or opens. Not on every 30-second refresh.
  const zoneKey = useMemo(
    () =>
      zonesFromIncidents(incidents)
        .map((z) => z.id)
        .sort()
        .join("|"),
    [incidents],
  );
  const candidateKey = useMemo(
    () =>
      request?.mode === "nearest"
        ? routingCandidates(shelters)
            .map((c) => c.id)
            .sort()
            .join("|")
        : "",
    [request?.mode, shelters],
  );
  useEffect(() => {
    const asked = requestRef.current;
    const origin = originRef.current;
    if (!asked || !origin || outcomeRef.current?.status === "locating") return;
    compute({ request: asked, from: origin, source: origin.source, profile: profileRef.current });
    // Only the keys matter here: `compute` and the refs never change.
  }, [zoneKey, candidateKey, compute]);

  // ---- "Start": following the person ----

  const handleFix = useCallback(
    (fix) => {
      setLiveFix(fix);
      setFollowError(null); // a position arrived, so an earlier "unavailable" no longer applies
      originRef.current = { lat: fix.lat, lon: fix.lon, source: "device" };
      const current = outcomeRef.current;
      if (current?.status !== "ok") return;
      const here = progressOnRoute(current.route, current.steps, fix, segmentRef.current);
      segmentRef.current = here.segment;
      setProgress({ ...here, route: current.route });
      if (here.arrived) {
        setFollowing(false);
        setArrived(true);
        return;
      }
      const decision = nextRerouteState(rerouteRef.current, { offRoute: here.offRoute, usable: here.usable, now: Date.now() });
      rerouteRef.current = decision.state;
      if (decision.reroute && requestRef.current) {
        setRerouting(true);
        compute({ request: requestRef.current, from: fix, source: "device", profile: profileRef.current })
          .then((fresh) => {
            // Place the person on the new route straight away, instead of waiting for the next fix.
            if (fresh?.status === "ok") setProgress({ ...progressOnRoute(fresh.route, fresh.steps, fix, 0), route: fresh.route });
          })
          .finally(() => setRerouting(false));
      }
    },
    [compute],
  );

  useEffect(() => {
    if (!following) return undefined;
    return watchDevicePosition(
      handleFix,
      (code) => {
        setFollowError(code);
        if (code === "denied" || code === "unsupported") setFollowing(false);
      },
      { highAccuracy: true },
    );
  }, [following, handleFix]);

  const startFollowing = useCallback(() => {
    rerouteRef.current = initialRerouteState();
    segmentRef.current = 0;
    setFollowError(null);
    setArrived(false);
    setFollowing(true);
  }, []);
  const stopFollowing = useCallback(() => setFollowing(false), []);

  // ---- what the screens show ----

  const route = outcome?.status === "ok" ? outcome.route : null;
  const steps = outcome?.status === "ok" ? outcome.steps : null;
  const destination = useMemo(() => {
    if (request?.mode === "incident") return null;
    const id = outcome?.status === "ok" ? outcome.shelterId : request?.shelterId;
    return id ? ((shelters ?? []).find((s) => s._id === id) ?? null) : null;
  }, [outcome, request, shelters]);
  // The incident being navigated to (incident mode only), kept up to date with the list.
  const destinationIncident = useMemo(
    () => (request?.mode === "incident" ? ((incidents ?? []).find((i) => String(i._id) === String(request.incidentId)) ?? null) : null),
    [request, incidents],
  );
  const warnings = useMemo(() => {
    if (!route) return [];
    if (request?.mode === "incident") {
      // The destination's own zone and its own "passes an incident" warning are left out; other incidents still count.
      return [...incidentDestinationWarnings(destinationIncident), ...routeWarnings({ route, incidents: otherIncidents(incidents, request.incidentId), shelter: null })];
    }
    return routeWarnings({ route, incidents: incidents ?? [], shelter: destination });
  }, [route, incidents, destination, destinationIncident, request]);

  // Straight-line guidance for the fallback case (and for the dashed line on the map).
  const fallbackGuidance = useMemo(() => {
    if (outcome?.status !== "fallback") return null;
    const base = { from: outcome.from, source: outcome.source, incidents: incidents ?? [] };
    if (request?.mode === "incident") return null;
    if (request?.mode === "nearest") return buildGuidance({ ...base, shelters: shelters ?? [] });
    return destination ? guidanceFor({ ...base, shelter: destination }) : null;
  }, [outcome, request?.mode, shelters, incidents, destination]);
  // The same for an incident: a straight line and compass direction.
  const incidentFallback = useMemo(
    () => (outcome?.status === "fallback" && destinationIncident ? incidentGuidance({ from: outcome.from, source: outcome.source, incident: destinationIncident }) : null),
    [outcome, destinationIncident],
  );

  return {
    request,
    outcome,
    profile,
    computing,
    busy: outcome?.status === "locating" || (computing && outcome === null),
    following,
    arrived,
    rerouting,
    liveFix: following ? liveFix : null,
    followError,
    progress: progress && progress.route === route ? progress : null,
    route,
    steps,
    destination,
    destinationIncident,
    warnings,
    fallbackGuidance,
    incidentFallback,
    pendingConfirm,
    askToNavigateToIncident,
    confirmPending,
    cancelPending,
    // Changes with every press of a button and every change of Walk/Drive, but not when the
    // route is refreshed in the background: the map re-frames only for these.
    fitKey: request ? `${request.id}:${profile}` : null,
    startNearest,
    startTo,
    startToIncident,
    retry,
    setProfile,
    clear,
    startFollowing,
    stopFollowing,
  };
}
