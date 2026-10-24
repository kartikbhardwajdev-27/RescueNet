"use client";

import Link from "next/link";
import { CalendarClock, MapPin, Users } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import Card from "@/components/Card";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/home/states";
import { toneClasses } from "@/components/home/tones";
import usePolledResource from "@/components/usePolledResource";
import { fetchMyEvents } from "@/lib/api";
import { eventHasEnded } from "@/lib/eventRules";
import { eventTypeMeta } from "./eventMeta";
import { formatEventWhen } from "./eventTime";

const MAX_SHOWN = 8;

const badge = (tone) => `rounded-full px-2.5 py-0.5 text-xs font-bold ${toneClasses(tone).badge}`;

function Row({ event, now, hosting }) {
  const { label, icon: Icon } = eventTypeMeta(event.type);
  const cancelled = event.status === "cancelled";
  const ended = !cancelled && eventHasEnded(event, now);
  const going = !cancelled && !ended && Date.parse(event.startsAt) <= now;

  return (
    <li className="flex items-start gap-3 py-3.5 first:pt-0 last:pb-0" data-testid="my-event">
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${toneClasses("blue").badge}`}>
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold break-words">{event.title}</p>
          <span className={badge("blue")}>{label}</span>
          {cancelled && <span className={badge("amber")}>Cancelled</span>}
          {ended && <span className={badge("muted")}>Ended</span>}
          {going && <span className={badge("amber")}>Happening now</span>}
        </div>
        <p className="mt-1 flex items-start gap-2 text-sm text-ink-muted">
          <CalendarClock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {formatEventWhen(event.startsAt, event.endsAt)}
        </p>
        <p className="mt-0.5 flex items-start gap-2 text-sm text-ink-muted">
          <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span className="break-words">{event.address}</span>
        </p>
        {hosting ? (
          <p className="mt-1.5 flex items-center gap-2 text-sm font-semibold">
            <Users className="size-4 shrink-0 text-info" aria-hidden="true" />
            {event.attendeeCount} {event.attendeeCount === 1 ? "person has" : "people have"} joined
            {event.capacity != null && <span className="font-normal text-ink-muted"> · {event.capacity} spaces</span>}
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-ink-muted">Organized by {event.organizer?.orgName || "an organization"}</p>
        )}
      </div>
    </li>
  );
}

function Section({ title, hint, events, now, hosting }) {
  const shown = events.slice(0, MAX_SHOWN);
  return (
    <section aria-label={title} className="mt-5 first:mt-0">
      <h4 className="text-xs font-semibold tracking-wide text-ink-muted uppercase">{title}</h4>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
      <ul className="mt-3 divide-y divide-line">
        {shown.map((event) => (
          <Row key={event._id} event={event} now={now} hosting={hosting} />
        ))}
      </ul>
      {events.length > MAX_SHOWN && (
        <p className="mt-3 text-xs text-ink-muted">
          Showing the next {MAX_SHOWN} of {events.length}.
        </p>
      )}
    </section>
  );
}

// On the account page. A citizen sees the events they joined; an organization
// sees the events it is hosting with how many people have joined each (and any it
// joined itself). Cancelled events stay in the list, marked, so someone who
// signed up finds out.
export default function MyEvents() {
  const { user } = useAuth();
  const mine = usePolledResource(fetchMyEvents);
  const isOrg = user?.role === "organization";
  const hosting = mine.data?.hosting ?? [];
  const joined = mine.data?.joined ?? [];
  const now = mine.fetchedAt ?? 0;
  const waiting = mine.loading && !mine.data;
  const failed = !mine.data && !waiting;
  const empty = mine.data && hosting.length === 0 && joined.length === 0;

  return (
    <Card lift={false} className="mt-6 max-w-2xl" aria-labelledby="my-events-heading">
      <h3 id="my-events-heading" className="font-display text-lg font-bold">
        My events
      </h3>
      <p className="mt-1 text-sm text-ink-muted">
        {isOrg ? "Events your organization is hosting, and how many people have joined." : "Events you have joined."}
      </p>

      <div className="mt-5">
        {waiting && <SkeletonRows rows={2} rowClassName="h-16" />}
        {failed && <ErrorState message={mine.error} onRetry={mine.refresh} />}
        {empty && (
          <EmptyState
            icon="calendar-days"
            title={isOrg ? "You aren't hosting anything yet" : "You haven't joined any events"}
            hint={isOrg ? "Create a volunteer drive, donation camp or training on the Events page." : "Find a volunteer drive, donation camp or training near you."}
          />
        )}
        {hosting.length > 0 && <Section title="Hosting" events={hosting} now={now} hosting />}
        {joined.length > 0 && <Section title={isOrg ? "Joined" : "Going to"} events={joined} now={now} />}
        {mine.data && (
          <Link
            href="/events"
            className="mt-5 inline-flex rounded-2xl border border-line-strong bg-white/5 px-4 py-2 text-sm font-bold transition-all duration-150 hover:bg-white/10 motion-safe:active:scale-95"
          >
            {isOrg ? "Open Events" : "Browse events"}
          </Link>
        )}
      </div>
    </Card>
  );
}
