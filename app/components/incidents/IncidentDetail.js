"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarClock, CircleCheck, Hash, Lightbulb, Map as MapIcon, MapPin, Play, SearchX, UserRound } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import Card from "@/components/Card";
import { ErrorState, Skeleton } from "@/components/home/states";
import { incidentKindMeta } from "@/components/incidentMeta";
import { useToast } from "@/components/SosProvider";
import usePolledResource from "@/components/usePolledResource";
import { fetchIncident, incidentReference, updateIncidentStatus } from "@/lib/api";
import { mapHref } from "@/lib/mapFocus";
import { formatRelativeTime, incidentTime } from "@/lib/time";
import { severityFromScore } from "@/lib/triage";
import { PriorityBadge, SeverityBadge, StatusBadge } from "./IncidentBadges";
import { describeReasons } from "./priorityText";
import SosBadge from "./SosBadge";

// MapLibre needs the browser, so the little map is loaded on demand.
const IncidentMiniMap = dynamic(() => import("./IncidentMiniMap"), {
  ssr: false,
  loading: () => <Skeleton className="h-56 sm:h-72" />,
});

// A gap smaller than this between "submitted" and "received" is just network
// time, not worth a second line.
const NOTABLE_GAP_MS = 60_000;

const formatDateTime = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function Fact({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-5 shrink-0 text-ink-muted" aria-hidden="true" />
      <div className="min-w-0">
        <dt className="text-xs font-semibold tracking-wide text-ink-muted uppercase">{label}</dt>
        <dd className="mt-0.5 break-words text-ink">{children}</dd>
      </div>
    </div>
  );
}

function BackButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      // Straight to Home when this page was opened directly (a shared link).
      onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
      className="mb-5 flex items-center gap-2 rounded-xl px-1 py-1 text-sm font-semibold text-ink-muted transition-colors hover:text-ink"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      Back
    </button>
  );
}

function NotFound() {
  return (
    <Card lift={false} className="max-w-2xl">
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-white/5 text-ink-muted">
          <SearchX className="size-6" aria-hidden="true" />
        </span>
        <h2 className="font-display text-xl font-bold">We couldn&apos;t find that incident</h2>
        <p className="max-w-sm text-sm text-ink-muted">The link may be wrong, or the incident may have been removed.</p>
        <Link
          href="/"
          className="mt-2 rounded-2xl bg-brand-gradient px-5 py-2.5 text-sm font-bold text-on-brand shadow-brand transition-all duration-150 motion-safe:active:scale-95"
        >
          Go to Home
        </Link>
      </div>
    </Card>
  );
}

function Loading() {
  return (
    <Card lift={false} className="max-w-2xl" aria-busy="true" aria-label="Loading incident">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="mt-4 h-5 w-1/3" />
      <Skeleton className="mt-6 h-20" />
      <Skeleton className="mt-6 h-56" />
    </Card>
  );
}

// Why the words of a report earned a suggested priority. Shown only when some
// of them did (older incidents have no score, and many reports have no keyword).
// These are plain keyword rules: it says which words, not that anyone checked.
function SuggestedPriorityNote({ triage }) {
  const reasons = triage?.reasons;
  const suggested = typeof triage?.score === "number" ? severityFromScore(triage.score) : null;
  if (!suggested || !Array.isArray(reasons) || reasons.length === 0) return null;
  return (
    <div className="mt-4 rounded-2xl border border-info/30 bg-info/10 p-3.5">
      <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
        <Lightbulb className="size-4 text-info" aria-hidden="true" />
        Suggested priority
        <PriorityBadge severity={suggested} />
      </p>
      <p className="mt-1.5 text-sm text-ink-muted">
        Because the description {describeReasons(reasons)}. This comes from simple keyword rules, so responders still
        decide.
      </p>
    </div>
  );
}

// An organization changes the status; everyone else just sees it. The server
// checks the role as well, so hiding the buttons is only a convenience.
function StatusControls({ incident, onChanged }) {
  const showToast = useToast();
  const [busy, setBusy] = useState(null); // the status being set, or null

  const choose = useCallback(
    async (status) => {
      setBusy(status);
      const result = await updateIncidentStatus(incident._id, status);
      setBusy(null);
      if (!result.ok) {
        showToast(result.message, { kind: "error", duration: 6000 });
        return;
      }
      showToast(status === "resolved" ? "Marked as resolved" : "Marked as in progress");
      onChanged();
    },
    [incident._id, onChanged, showToast],
  );

  const options = [
    { status: "in_progress", label: "Mark in progress", currentLabel: "Currently in progress", Icon: Play },
    { status: "resolved", label: "Mark resolved", currentLabel: "Currently resolved", Icon: CircleCheck },
  ];

  return (
    <section aria-labelledby="status-heading" className="mt-6 rounded-2xl border border-line bg-white/5 p-4 sm:p-5">
      <h2 id="status-heading" className="font-display text-lg font-bold">
        Update status
      </h2>
      <p className="mt-1 text-sm text-ink-muted">Everyone who opens this incident sees the new status.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        {options.map(({ status, label, currentLabel, Icon }) => {
          const current = incident.status === status;
          return (
            <button
              key={status}
              type="button"
              onClick={() => choose(status)}
              disabled={current || busy !== null}
              aria-busy={busy === status}
              className="flex items-center gap-2 rounded-2xl border border-line-strong bg-white/5 px-4 py-2.5 text-sm font-bold transition-all duration-150 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60 motion-safe:active:scale-95"
            >
              <Icon className="size-4" aria-hidden="true" />
              {busy === status ? "Saving…" : current ? currentLabel : label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

// One incident: what it is, where, when, its status, and (for organizations)
// the buttons to change the status. Shows only what the record holds: there is
// no history of status changes, so none is drawn.
export default function IncidentDetail({ id }) {
  const { user, loading: authLoading } = useAuth();
  const fetcher = useCallback((options) => fetchIncident(id, options), [id]);
  const resource = usePolledResource(fetcher);
  const incident = resource.data;

  if (!incident) {
    if (resource.errorKind === "not_found" || resource.errorKind === "bad_request") return <NotFound />;
    if (resource.error) {
      return (
        <Card lift={false} className="max-w-2xl">
          <ErrorState message={resource.error} onRetry={resource.refresh} />
        </Card>
      );
    }
    return <Loading />;
  }

  const { label: typeLabel, icon: TypeIcon, isSos } = incidentKindMeta(incident);
  const [lng, lat] = incident.location.coordinates;
  const now = resource.fetchedAt ?? 0;
  const shownAt = incidentTime(incident);
  const receivedLate = incident.capturedAt && Date.parse(incident.createdAt) - Date.parse(incident.capturedAt) > NOTABLE_GAP_MS;
  const changedSince = Date.parse(incident.updatedAt) - Date.parse(incident.createdAt) > NOTABLE_GAP_MS;
  const isMine = Boolean(user && incident.isMine);
  const isOrganization = !authLoading && user?.role === "organization";

  return (
    <>
      <BackButton />
      <Card lift={false} className="max-w-2xl">
        <div className="flex items-start gap-4">
          <span
            className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${isSos ? "bg-sos/20 text-sos-soft" : "bg-white/10"}`}
          >
            <TypeIcon className="size-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-center gap-2.5 font-display text-2xl font-bold tracking-tight">
              {/* An SOS is stored as type "other"; the red badge stands where "Other" would read. */}
              {isSos ? (
                <>
                  <SosBadge className="text-sm" />
                  Alert
                </>
              ) : (
                typeLabel
              )}
            </h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <SeverityBadge severity={incident.severity} />
              <StatusBadge status={incident.status} />
              {isMine && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-info/15 px-2.5 py-1 text-xs font-bold text-info">
                  <UserRound className="size-3.5" aria-hidden="true" />
                  Reported by you
                </span>
              )}
            </div>
          </div>
        </div>

        <p className="mt-5 text-ink break-words whitespace-pre-wrap">{incident.description}</p>

        <SuggestedPriorityNote triage={incident.triage} />

        <dl className="mt-6 grid gap-5 sm:grid-cols-2">
          <Fact icon={MapPin} label="Address">
            {incident.address || "No address given"}
            <span className="mt-0.5 block text-xs text-ink-muted">
              {lat.toFixed(5)}, {lng.toFixed(5)}
            </span>
          </Fact>
          <Fact icon={CalendarClock} label="Reported">
            <time dateTime={shownAt}>{formatRelativeTime(shownAt, now)}</time>
            <span className="mt-0.5 block text-xs text-ink-muted">{formatDateTime(shownAt)}</span>
            {receivedLate && (
              <span className="mt-0.5 block text-xs text-ink-muted">Reached the server {formatDateTime(incident.createdAt)}</span>
            )}
          </Fact>
          <Fact icon={Hash} label="Reference">
            {incidentReference(incident._id)}
          </Fact>
          {changedSince && (
            <Fact icon={CalendarClock} label="Last updated">
              <time dateTime={incident.updatedAt}>{formatRelativeTime(incident.updatedAt, now)}</time>
            </Fact>
          )}
        </dl>

        <div className="mt-6">
          <IncidentMiniMap incident={incident} />
        </div>

        <Link
          href={mapHref("incident", incident._id)}
          className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-line-strong bg-white/5 px-4 py-2.5 text-sm font-bold transition-all duration-150 hover:bg-white/10 motion-safe:active:scale-95"
        >
          <MapIcon className="size-4" aria-hidden="true" />
          View on map
        </Link>

        {isOrganization && <StatusControls incident={incident} onChanged={resource.refresh} />}
      </Card>
    </>
  );
}
