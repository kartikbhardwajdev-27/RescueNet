"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, CalendarClock, Check, LoaderCircle, LogIn, MapPin, UserCheck, Users } from "lucide-react";
import Card from "@/components/Card";
import { toneClasses } from "@/components/home/tones";
import { eventHasEnded } from "@/lib/eventRules";
import { formatDistance } from "@/lib/geo";
import { describeSpaces, eventTypeMeta } from "./eventMeta";
import { formatEventWhen } from "./eventTime";

const badge = (tone) => `rounded-full px-2.5 py-1 text-xs font-bold ${toneClasses(tone).badge}`;
const buttonBase =
  "flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-60 motion-safe:active:scale-95";
const primary = `${buttonBase} bg-brand-gradient text-on-brand shadow-brand hover:brightness-110`;
const secondary = `${buttonBase} border border-line-strong bg-white/5 hover:bg-white/10`;

// One event: what, when, where, who is running it, how many spaces are left, and
// the one action that makes sense for the person looking at it:
//   not logged in    "Log in to join"
//   joined           "Leave"
//   free space       "Join"      (Full / Cancelled / Ended are shown, not clickable)
//   organizer        attendee count and "Cancel event" (asks first)
// `busy` is true while a request for this event is running.
export default function EventCard({ event, now, distanceKm, loggedIn, busy, onJoin, onLeave, onCancel }) {
  const [confirming, setConfirming] = useState(false);
  const { label, icon: TypeIcon } = eventTypeMeta(event.type);
  const cancelled = event.status === "cancelled";
  const ended = !cancelled && eventHasEnded(event, now);
  const happeningNow = !cancelled && !ended && Date.parse(event.startsAt) <= now;
  const full = event.spacesLeft === 0;
  const organizer = event.organizer?.orgName || "An organization";

  let action;
  if (event.hosting) {
    action = null; // handled below: attendee count and cancel
  } else if (!loggedIn) {
    action = (
      <Link href="/login" className={secondary}>
        <LogIn className="size-4" aria-hidden="true" />
        Log in to join
      </Link>
    );
  } else if (event.joined) {
    action = (
      <button type="button" onClick={() => onLeave(event)} disabled={busy} aria-busy={busy} className={secondary}>
        {busy ? <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden="true" /> : <Check className="size-4 text-info" aria-hidden="true" />}
        {busy ? "Leaving…" : "Going · Leave"}
      </button>
    );
  } else if (cancelled || ended || full) {
    action = (
      <button type="button" disabled className={secondary}>
        {cancelled ? "Cancelled" : ended ? "Ended" : "Full"}
      </button>
    );
  } else {
    action = (
      <button type="button" onClick={() => onJoin(event)} disabled={busy} aria-busy={busy} className={primary}>
        {busy && <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden="true" />}
        {busy ? "Joining…" : "Join"}
      </button>
    );
  }

  return (
    <Card as="article" padded={false} lift className="flex flex-col gap-4 p-5" data-event-id={event._id} data-testid="event-card">
      <div className="flex items-start gap-3">
        <span className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${toneClasses("blue").badge}`}>
          <TypeIcon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg leading-snug font-bold break-words">{event.title}</h3>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <span className={badge("blue")}>{label}</span>
            {event.hosting && <span className="rounded-full bg-brand-gradient px-2.5 py-1 text-xs font-bold text-on-brand">Hosting</span>}
            {happeningNow && <span className={badge("amber")}>Happening now</span>}
            {cancelled && <span className={badge("amber")}>Cancelled</span>}
            {ended && <span className={badge("muted")}>Ended</span>}
          </div>
        </div>
      </div>

      <p className="line-clamp-3 text-sm break-words whitespace-pre-wrap text-ink-muted">{event.description}</p>

      <dl className="flex flex-col gap-2 text-sm">
        <div className="flex items-start gap-2.5">
          <dt className="sr-only">When</dt>
          <CalendarClock className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden="true" />
          <dd className="font-semibold">{formatEventWhen(event.startsAt, event.endsAt)}</dd>
        </div>
        <div className="flex items-start gap-2.5">
          <dt className="sr-only">Where</dt>
          <MapPin className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden="true" />
          <dd className="break-words">
            {event.address}
            {distanceKm != null && <span className="text-ink-muted"> · {formatDistance(distanceKm)} away</span>}
          </dd>
        </div>
        <div className="flex items-start gap-2.5">
          <dt className="sr-only">Organized by</dt>
          <Building2 className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden="true" />
          <dd className="text-ink-muted">{organizer}</dd>
        </div>
        <div className="flex items-start gap-2.5">
          <dt className="sr-only">Spaces</dt>
          {event.joined ? (
            <UserCheck className="mt-0.5 size-4 shrink-0 text-info" aria-hidden="true" />
          ) : (
            <Users className={`mt-0.5 size-4 shrink-0 ${full && !cancelled ? "text-warn" : "text-ink-muted"}`} aria-hidden="true" />
          )}
          <dd className={full && !cancelled ? "font-semibold text-warn" : event.joined ? "font-semibold text-info" : "text-ink-muted"}>
            {event.hosting ? `${event.attendeeCount} joined${event.capacity != null ? ` of ${event.capacity}` : ""}` : describeSpaces(event)}
          </dd>
        </div>
      </dl>

      <div className="mt-auto pt-1">
        {action}
        {event.hosting && !cancelled && !ended && (
          <>
            {!confirming ? (
              <button type="button" onClick={() => setConfirming(true)} disabled={busy} className={secondary}>
                Cancel event
              </button>
            ) : (
              <div role="alertdialog" aria-label="Confirm cancelling this event" className="rounded-2xl border border-warn/40 bg-warn/10 p-3.5">
                <p className="text-sm font-semibold">
                  Cancel this event?
                  {event.attendeeCount > 0 && ` ${event.attendeeCount} ${event.attendeeCount === 1 ? "person has" : "people have"} joined.`}
                </p>
                <p className="mt-0.5 text-xs text-ink-muted">It will disappear from the list and people who joined will see it as cancelled.</p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await onCancel(event);
                      setConfirming(false);
                    }}
                    disabled={busy}
                    aria-busy={busy}
                    className={`${primary} flex-1`}
                  >
                    {busy ? "Cancelling…" : "Yes, cancel it"}
                  </button>
                  <button type="button" onClick={() => setConfirming(false)} disabled={busy} className={`${secondary} flex-1`}>
                    Keep it
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
