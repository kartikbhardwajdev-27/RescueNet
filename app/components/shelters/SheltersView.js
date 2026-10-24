"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Compass, LoaderCircle, Map as MapIcon, Plus, Search } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { EmptyState, ErrorState, Skeleton } from "@/components/home/states";
import { useToast } from "@/components/SosProvider";
import useNearestShelter from "@/components/useNearestShelter";
import usePolledResource from "@/components/usePolledResource";
import useUserLocation from "@/components/useUserLocation";
import { fetchIncidents, fetchShelters } from "@/lib/api";
import { distanceKm } from "@/lib/geo";
import { bearingDegrees, compassDirection, shelterWarnings } from "@/lib/nearest";
import { SHELTER_STATUSES } from "@/lib/shelterRules";
import NearestPanel, { nearestPanelButtonClass } from "./NearestPanel";
import ShelterCard from "./ShelterCard";
import ShelterFormModal from "./ShelterFormModal";
import { SHELTER_STATUS_META } from "./statusMeta";

const FILTERS = [{ value: "all", label: "All" }, ...SHELTER_STATUSES.map((value) => ({ value, label: SHELTER_STATUS_META[value].label }))];

// Search + status filter over the live shelter list. Nearest first when the
// person's location is known (browser, else saved), newest first otherwise.
// Organizations also get "Add shelter" and an edit button on shelters they added.
export default function SheltersView() {
  const { user } = useAuth();
  const showToast = useToast();
  const shelters = usePolledResource(fetchShelters);
  // Only used to warn about shelters near an active incident.
  const incidents = usePolledResource(fetchIncidents);
  const place = useUserLocation();
  const nearest = useNearestShelter({
    device: place.source === "device" ? place.location : null,
    shelters: shelters.data,
    incidents: incidents.data,
  });
  const nearestId = nearest.guidance?.shelter._id ?? null;
  const nearestRequestId = nearest.request?.id ?? null;
  const hasNearest = nearestId !== null;
  const warnings = useMemo(() => shelterWarnings(shelters.data ?? [], incidents.data ?? []), [shelters.data, incidents.data]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  // null = closed, { shelter: null } = adding, { shelter } = editing
  const [modal, setModal] = useState(null);

  const isOrg = user?.role === "organization";

  const rows = useMemo(() => {
    const list = (shelters.data ?? []).map((shelter) => {
      const point = { lng: shelter.location.coordinates[0], lat: shelter.location.coordinates[1] };
      return {
        shelter,
        distanceKm: place.location ? distanceKm(place.location, point) : null,
        direction: place.location ? compassDirection(bearingDegrees(place.location, point)) : null,
      };
    });
    return place.location ? list.sort((a, b) => a.distanceKm - b.distanceKm) : list;
  }, [shelters.data, place.location]);

  const counts = useMemo(() => {
    const tally = { all: rows.length };
    for (const { shelter } of rows) tally[shelter.status] = (tally[shelter.status] ?? 0) + 1;
    return tally;
  }, [rows]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter(
      ({ shelter }) =>
        (status === "all" || shelter.status === status) &&
        (needle === "" || `${shelter.name} ${shelter.address}`.toLowerCase().includes(needle)),
    );
  }, [rows, query, status]);

  const waiting = shelters.loading && !shelters.data;
  const failed = !shelters.data && !waiting;

  // After "Nearest shelter" answers, bring its card into view. Once per press,
  // not on every refresh.
  useEffect(() => {
    if (!hasNearest) return;
    const card = document.querySelector(`[data-shelter-id="${nearestId}"]`);
    card?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scroll only when a new request was answered
  }, [nearestRequestId, hasNearest]);

  function handleNearest() {
    // The answer must not be hidden by a filter or a search left over.
    setQuery("");
    setStatus("all");
    nearest.find();
  }

  function handleSaved(shelter, kind) {
    setModal(null);
    showToast(kind === "created" ? `Shelter added: ${shelter.name}` : `Shelter updated: ${shelter.name}`);
    shelters.refresh();
  }

  return (
    <div className="@container">
      <div className="flex flex-col gap-4 @2xl:flex-row @2xl:items-center">
        <div className="relative flex-1">
          <label htmlFor="shelter-search" className="sr-only">
            Search shelters by name or address
          </label>
          <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
          <input
            id="shelter-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or address"
            autoComplete="off"
            className="w-full rounded-2xl border border-line-strong bg-white/5 py-3 pr-4 pl-12 text-ink transition-colors duration-150 placeholder:text-ink-muted/70 hover:border-white/25 focus:border-brand-to"
          />
        </div>
        <button
          type="button"
          onClick={handleNearest}
          disabled={nearest.busy || !shelters.data}
          className="flex items-center justify-center gap-2 rounded-2xl border border-line-strong bg-white/5 px-5 py-3 font-display font-bold transition-all duration-150 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-70 motion-safe:active:scale-95"
        >
          {nearest.busy ? (
            <LoaderCircle className="size-5 motion-safe:animate-spin" aria-hidden="true" />
          ) : (
            <Compass className="size-5 text-safe" aria-hidden="true" />
          )}
          {nearest.busy ? "Finding…" : "Nearest shelter"}
        </button>
        {isOrg && (
          <button
            type="button"
            onClick={() => setModal({ shelter: null })}
            className="flex items-center justify-center gap-2 rounded-2xl bg-brand-gradient px-5 py-3 font-display font-bold text-on-brand shadow-brand transition-all duration-150 hover:brightness-110 motion-safe:active:scale-95"
          >
            <Plus className="size-5" aria-hidden="true" />
            Add shelter
          </button>
        )}
      </div>

      {nearest.request && nearest.request.phase !== "locating" && (
        <div className="mt-4">
          <NearestPanel
            request={nearest.request}
            guidance={nearest.guidance}
            incidentsKnown={nearest.incidentsKnown}
            onClear={nearest.clear}
            onRetry={nearest.find}
          >
            {nearest.guidance && (
              <Link href="/map?nearest=1" className={nearestPanelButtonClass}>
                <MapIcon className="size-3.5" aria-hidden="true" />
                Show the line on the map
              </Link>
            )}
          </NearestPanel>
        </div>
      )}

      <div role="group" aria-label="Filter by status" className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map(({ value, label }) => {
          const selected = status === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={selected}
              onClick={() => setStatus(value)}
              className={`rounded-full px-4 py-2 text-sm font-bold transition-all duration-150 motion-safe:active:scale-95 ${
                selected ? "bg-brand-gradient text-on-brand shadow-brand" : "border border-line-strong bg-white/5 text-ink-muted hover:bg-white/10 hover:text-ink"
              }`}
            >
              {label}
              {shelters.data && (
                <>
                  {" "}
                  <span className="ml-0.5 font-semibold opacity-80">{counts[value] ?? 0}</span>
                </>
              )}
            </button>
          );
        })}
      </div>

      {shelters.data && (
        <p aria-live="polite" className="mt-4 text-sm text-ink-muted">
          Showing {visible.length} of {rows.length} {rows.length === 1 ? "shelter" : "shelters"}
          {place.location ? ` · nearest first${place.source === "saved" ? " (from your saved location)" : ""}` : " · newest first"}
        </p>
      )}

      <div className="mt-4">
        {waiting && (
          <div aria-busy="true" aria-label="Loading shelters" className="grid gap-4 @2xl:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-52 rounded-card" />
            ))}
          </div>
        )}
        {failed && <ErrorState message={shelters.error} onRetry={shelters.refresh} />}
        {shelters.data && rows.length === 0 && (
          <EmptyState
            icon="house-plus"
            title="No shelters listed yet"
            hint={isOrg ? "Be the first: add a shelter your organization runs." : "Organizations can add shelters once they log in."}
          />
        )}
        {rows.length > 0 && visible.length === 0 && (
          <EmptyState icon="inbox" title="No shelters match" hint="Try a different search or status filter." />
        )}
        {visible.length > 0 && (
          <div className="grid gap-4 @2xl:grid-cols-2">
            {visible.map(({ shelter, distanceKm: distance, direction }) => (
              <ShelterCard
                key={shelter._id}
                shelter={shelter}
                distanceKm={distance}
                direction={direction}
                warning={warnings.get(shelter._id)}
                isNearest={shelter._id === nearestId}
                canEdit={isOrg && !shelter.seeded && shelter.isMine}
                onEdit={(target) => setModal({ shelter: target })}
              />
            ))}
          </div>
        )}
      </div>

      {modal && <ShelterFormModal shelter={modal.shelter} onClose={() => setModal(null)} onSaved={handleSaved} />}
    </div>
  );
}
