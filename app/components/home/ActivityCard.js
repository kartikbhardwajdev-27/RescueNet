"use client";

import { useMemo } from "react";
import Link from "next/link";
import Card from "@/components/Card";
import SosBadge from "@/components/incidents/SosBadge";
import { incidentTypeMeta } from "@/components/incidentMeta";
import { buildActivityItems } from "@/lib/dashboard";
import { incidentHref } from "@/lib/incidentLinks";
import { formatRelativeTime } from "@/lib/time";
import { EmptyState, ErrorState, SkeletonRows } from "./states";
import { toneClasses } from "./tones";

// The latest incidents as a timeline: when it was reported, what type, and its status.
export default function ActivityCard({ incidents, className = "" }) {
  const items = useMemo(
    () => buildActivityItems(incidents.data ?? [], { typeLabel: (type) => incidentTypeMeta(type).label }),
    [incidents.data],
  );
  const now = incidents.fetchedAt ?? 0;
  const waiting = incidents.loading && !incidents.data;
  const failed = !incidents.data && !waiting;

  return (
    <Card className={className}>
      <h2 className="font-display text-xl font-bold tracking-tight">Recent activity</h2>
      <div className="mt-5">
        {waiting && <SkeletonRows rows={3} rowClassName="h-14" />}
        {failed && <ErrorState message={incidents.error} onRetry={incidents.refresh} />}
        {!waiting && !failed && items.length === 0 && (
          <EmptyState icon="triangle-alert" title="No incidents yet" hint="Reports from the community will show up here, newest first." />
        )}
        {items.length > 0 && (
          // The vertical line is one pseudo-element behind the dots.
          <ol className="relative flex flex-col gap-5 before:absolute before:top-2 before:bottom-2 before:left-[7px] before:w-px before:bg-line-strong">
            {items.map((item) => (
              <li key={item.id} className="relative pl-8">
                <span
                  aria-hidden="true"
                  className={`absolute top-1 left-0 size-3.5 rounded-full ring-4 ring-surface ${toneClasses(item.tone).dot}`}
                />
                <Link
                  href={incidentHref(item.id)}
                  className="-mx-2 -my-1 block rounded-xl px-2 py-1 transition-colors hover:bg-white/5"
                >
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    {item.isSos && <SosBadge />}
                    {item.title}
                  </p>
                  <p className="text-xs text-ink-muted">{item.detail}</p>
                  <p className="mt-0.5 text-xs font-medium text-ink-muted">
                    <time dateTime={item.time} title={new Date(item.time).toLocaleString()}>
                      {formatRelativeTime(item.time, now)}
                    </time>
                  </p>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Card>
  );
}
