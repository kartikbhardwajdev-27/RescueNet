"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import Card from "@/components/Card";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/home/states";
import { incidentKindMeta } from "@/components/incidentMeta";
import usePolledResource from "@/components/usePolledResource";
import { fetchMyIncidents } from "@/lib/api";
import { incidentHref } from "@/lib/incidentLinks";
import { formatRelativeTime, incidentTime } from "@/lib/time";
import NavigateHereLink from "./NavigateHereLink";
import { SeverityBadge, StatusBadge } from "./IncidentBadges";
import SosBadge from "./SosBadge";

const MAX_SHOWN = 10;

// Every report and SOS the logged-in person made, newest first, each linking to
// its own page. The server only ever returns the caller's own (?mine=true).
export default function MyReports() {
  const reports = usePolledResource(fetchMyIncidents);
  const list = reports.data ?? [];
  const now = reports.fetchedAt ?? 0;
  const waiting = reports.loading && !reports.data;
  const failed = !reports.data && !waiting;

  return (
    <Card lift={false} className="mt-6 max-w-2xl" aria-labelledby="my-reports-heading">
      <h3 id="my-reports-heading" className="font-display text-lg font-bold">
        My reports
      </h3>
      <p className="mt-1 text-sm text-ink-muted">Reports and SOS alerts you sent while logged in, and where they stand.</p>

      <div className="mt-5">
        {waiting && <SkeletonRows rows={2} rowClassName="h-16" />}
        {failed && <ErrorState message={reports.error} onRetry={reports.refresh} />}
        {!waiting && !failed && list.length === 0 && (
          <EmptyState
            icon="file-plus"
            title="No reports yet"
            hint="When you report an incident while logged in, it shows up here so you can follow what happens."
          />
        )}
        {list.length > 0 && (
          <ul className="flex flex-col gap-1">
            {list.slice(0, MAX_SHOWN).map((incident) => {
              const { label, icon: Icon, isSos } = incidentKindMeta(incident);
              return (
                <li key={incident._id} className="flex items-center gap-2">
                  <Link
                    href={incidentHref(incident._id)}
                    className="group -mx-2 flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-3 transition-colors hover:bg-white/5"
                  >
                    <span
                      className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${isSos ? "bg-sos/20 text-sos-soft" : "bg-white/10"}`}
                    >
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        {isSos ? (
                          <span className="flex items-center gap-2 font-semibold">
                            <SosBadge />
                            Alert
                          </span>
                        ) : (
                          <span className="font-semibold">{label}</span>
                        )}
                        <StatusBadge status={incident.status} />
                        <SeverityBadge severity={incident.severity} />
                      </span>
                      <span className="mt-0.5 line-clamp-1 block text-sm break-words text-ink-muted">{incident.description}</span>
                      <span className="mt-0.5 block text-xs text-ink-muted">
                        <time dateTime={incidentTime(incident)}>{formatRelativeTime(incidentTime(incident), now)}</time>
                      </span>
                    </span>
                    <ChevronRight
                      className="size-5 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </Link>
                  <NavigateHereLink compact incidentId={incident._id} label={label} />
                </li>
              );
            })}
          </ul>
        )}
        {list.length > MAX_SHOWN && (
          <p className="mt-3 text-xs text-ink-muted">
            Showing your newest {MAX_SHOWN} of {list.length}.
          </p>
        )}
      </div>
    </Card>
  );
}
