"use client";

import { useCallback, useMemo, useState } from "react";
import { CalendarPlus } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { EmptyState, ErrorState, Skeleton } from "@/components/home/states";
import { useToast } from "@/components/SosProvider";
import usePolledResource from "@/components/usePolledResource";
import useUserLocation from "@/components/useUserLocation";
import { cancelEvent, fetchEvents, joinEvent, leaveEvent } from "@/lib/api";
import { distanceKm } from "@/lib/geo";
import EventCard from "./EventCard";
import { EVENT_FILTERS } from "./eventMeta";
import EventFormModal from "./EventFormModal";
import { toDateTimeLocalValue } from "./eventTime";

const HOUR_MS = 3_600_000;

// Upcoming events (not over yet, not cancelled), soonest first, with a filter by
// type. Anyone can browse; logged-in people join and leave; organizations also
// get "Create event" and can cancel their own. Refreshes every 30 s while visible.
export default function EventsView() {
  const { user } = useAuth();
  const showToast = useToast();
  const place = useUserLocation();
  const events = usePolledResource(fetchEvents);
  const [type, setType] = useState("all");
  const [busyId, setBusyId] = useState(null);
  // null = closed, { defaults } = open
  const [modal, setModal] = useState(null);

  const isOrg = user?.role === "organization";
  const now = events.fetchedAt ?? 0;
  const list = useMemo(() => events.data ?? [], [events.data]);

  const counts = useMemo(() => {
    const tally = { all: list.length };
    for (const event of list) tally[event.type] = (tally[event.type] ?? 0) + 1;
    return tally;
  }, [list]);

  const visible = useMemo(() => list.filter((event) => type === "all" || event.type === type), [list, type]);

  const waiting = events.loading && !events.data;
  const failed = !events.data && !waiting;

  // Runs one join / leave / cancel for one event, tells the person what happened
  // (the server's own words when it says no: "This event is full"), and reloads
  // the list so the card shows the truth either way.
  const act = useCallback(
    async (event, run, success) => {
      setBusyId(event._id);
      const result = await run(event._id);
      if (result.ok) showToast(success);
      else showToast(result.message, { kind: "error", duration: 6000 });
      await events.refresh();
      setBusyId(null);
      return result;
    },
    [events, showToast],
  );

  const onJoin = useCallback((event) => act(event, joinEvent, `You joined “${event.title}”`), [act]);
  const onLeave = useCallback((event) => act(event, leaveEvent, `You left “${event.title}”`), [act]);
  const onCancel = useCallback((event) => act(event, cancelEvent, `Cancelled “${event.title}”`), [act]);

  function openCreate() {
    // Suggest the next whole hour, an hour from now.
    const start = Math.ceil((Date.now() + HOUR_MS) / HOUR_MS) * HOUR_MS;
    setModal({ defaults: { startsAt: toDateTimeLocalValue(start) } });
  }

  function handleSaved(event) {
    setModal(null);
    showToast(`Event created: ${event.title}`);
    events.refresh();
  }

  return (
    <div className="@container">
      {isOrg && (
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center justify-center gap-2 rounded-2xl bg-brand-gradient px-5 py-3 font-display font-bold text-on-brand shadow-brand transition-all duration-150 hover:brightness-110 motion-safe:active:scale-95"
          >
            <CalendarPlus className="size-5" aria-hidden="true" />
            Create event
          </button>
        </div>
      )}

      <div role="group" aria-label="Filter by type" className="flex flex-wrap gap-2">
        {EVENT_FILTERS.map(({ value, label }) => {
          const selected = type === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={selected}
              onClick={() => setType(value)}
              className={`rounded-full px-4 py-2 text-sm font-bold transition-all duration-150 motion-safe:active:scale-95 ${
                selected ? "bg-brand-gradient text-on-brand shadow-brand" : "border border-line-strong bg-white/5 text-ink-muted hover:bg-white/10 hover:text-ink"
              }`}
            >
              {label}
              {events.data && (
                <>
                  {/* a real space, so the label and count don't run together for screen readers */}{" "}
                  <span className="ml-0.5 font-semibold opacity-80">{counts[value] ?? 0}</span>
                </>
              )}
            </button>
          );
        })}
      </div>

      {events.data && (
        <p aria-live="polite" className="mt-4 text-sm text-ink-muted">
          Showing {visible.length} of {list.length} upcoming {list.length === 1 ? "event" : "events"} · soonest first
        </p>
      )}

      <div className="mt-4">
        {waiting && (
          <div aria-busy="true" aria-label="Loading events" className="grid gap-4 @2xl:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-64 rounded-card" />
            ))}
          </div>
        )}
        {failed && <ErrorState message={events.error} onRetry={events.refresh} />}
        {events.data && list.length === 0 && (
          <EmptyState
            icon="calendar-days"
            title="No upcoming events"
            hint={isOrg ? "Be the first: create a volunteer drive, donation camp or training." : "Organizations post volunteer drives, donation camps and trainings here. Check back soon."}
          />
        )}
        {list.length > 0 && visible.length === 0 && <EmptyState icon="inbox" title="No events of this type" hint="Try another type, or choose All." />}
        {visible.length > 0 && (
          <div className="grid gap-4 @2xl:grid-cols-2">
            {visible.map((event) => (
              <EventCard
                key={event._id}
                event={event}
                now={now}
                loggedIn={Boolean(user)}
                distanceKm={
                  place.location
                    ? distanceKm(place.location, { lng: event.location.coordinates[0], lat: event.location.coordinates[1] })
                    : null
                }
                busy={busyId === event._id}
                onJoin={onJoin}
                onLeave={onLeave}
                onCancel={onCancel}
              />
            ))}
          </div>
        )}
      </div>

      {modal && <EventFormModal defaults={modal.defaults} onClose={() => setModal(null)} onSaved={handleSaved} />}
    </div>
  );
}
