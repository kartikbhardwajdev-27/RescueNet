"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import Card from "@/components/Card";
import { plotPoints } from "@/lib/dashboard";
import { EmptyState, ErrorState, Skeleton } from "./states";
import { toneClasses } from "./tones";

// Not a real map: real incident and shelter positions, scaled to fit this card.
const KINDS = {
  incident: { label: "Active incident", tone: "red", pulse: true },
  response: { label: "Response in progress", tone: "amber", pulse: true },
  shelter: { label: "Open shelter", tone: "green", pulse: false },
  inactive: { label: "Full or closed shelter", tone: "muted", pulse: false },
};

const toPoint = (record, kind) => ({
  id: record._id,
  kind,
  lng: record.location.coordinates[0],
  lat: record.location.coordinates[1],
});

export default function MiniMap({ incidents, shelters, className = "" }) {
  const points = useMemo(
    () =>
      plotPoints([
        ...(incidents.data ?? [])
          .filter((i) => i.status !== "resolved")
          .map((i) => toPoint(i, i.status === "in_progress" ? "response" : "incident")),
        ...(shelters.data ?? []).map((s) => toPoint(s, s.status === "open" ? "shelter" : "inactive")),
      ]),
    [incidents.data, shelters.data],
  );

  const counts = useMemo(() => {
    const tally = {};
    for (const p of points) tally[p.kind] = (tally[p.kind] ?? 0) + 1;
    return tally;
  }, [points]);

  const waiting = (incidents.loading && !incidents.data) || (shelters.loading && !shelters.data);
  const failed = !incidents.data && !shelters.data && !waiting;

  return (
    <Card className={`flex flex-col ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold tracking-tight">Live disaster status</h2>
        <Link
          href="/map"
          className="flex shrink-0 items-center gap-1 rounded-xl px-2 py-1 text-sm font-semibold text-brand-to transition-colors hover:bg-white/10"
        >
          Open map
          <ArrowUpRight className="size-4" aria-hidden="true" />
        </Link>
      </div>

      {waiting && <Skeleton className="mt-4 min-h-64 flex-1 rounded-2xl" />}
      {failed && (
        <div className="mt-4 flex-1">
          <ErrorState
            message={incidents.error ?? shelters.error}
            onRetry={() => {
              incidents.refresh();
              shelters.refresh();
            }}
          />
        </div>
      )}
      {!waiting && !failed && points.length === 0 && (
        <div className="mt-4 flex-1">
          <EmptyState icon="house-plus" title="Nothing to plot yet" hint="Active incidents and shelters will appear as dots here." />
        </div>
      )}

      {points.length > 0 && (
        <>
          <p className="sr-only">
            {Object.entries(counts)
              .map(([kind, n]) => `${n} ${KINDS[kind].label.toLowerCase()}`)
              .join(", ")}
            , plotted to fit the card.
          </p>
          <div
            aria-hidden="true"
            className="map-grid relative mt-4 min-h-64 flex-1 overflow-hidden rounded-2xl border border-line bg-canvas/60"
          >
            <div className="pointer-events-none absolute -top-16 -left-10 size-56 rounded-full bg-brand-from/20 blur-3xl" />
            <div className="pointer-events-none absolute -right-10 -bottom-16 size-56 rounded-full bg-brand-to/15 blur-3xl" />

            {points.map((point, i) => {
              const kind = KINDS[point.kind];
              const dot = toneClasses(kind.tone).dot;
              return (
                <span
                  key={`${point.kind}-${point.id}`}
                  data-map-dot={point.kind}
                  data-map-id={point.id}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${point.x}%`, top: `${point.y}%` }}
                >
                  <span className="relative flex size-3.5">
                    {kind.pulse && (
                      <span
                        className={`absolute inline-flex size-full rounded-full opacity-75 motion-safe:animate-ping ${dot}`}
                        style={{ animationDelay: `${(i % 8) * 350}ms` }}
                      />
                    )}
                    <span className={`relative inline-flex size-3.5 rounded-full ring-2 ring-canvas ${dot}`} />
                  </span>
                </span>
              );
            })}
          </div>

          <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-ink-muted">
            {Object.entries(KINDS)
              .filter(([kind]) => counts[kind])
              .map(([kind, { label, tone }]) => (
                <li key={kind} className="flex items-center gap-2">
                  <span className={`size-2.5 rounded-full ${toneClasses(tone).dot}`} aria-hidden="true" />
                  {label} ({counts[kind]})
                </li>
              ))}
          </ul>
        </>
      )}
    </Card>
  );
}
