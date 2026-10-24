"use client";

import { useMemo } from "react";
import Link from "next/link";
import Card from "@/components/Card";
import { incidentTypeMeta } from "@/components/incidentMeta";
import { buildNearbyItems, capitalize } from "@/lib/dashboard";
import { formatDistance } from "@/lib/geo";
import { mapHref } from "@/lib/mapFocus";
import { formatRelativeTime } from "@/lib/time";
import Icon from "./Icon";
import { EmptyState, ErrorState, SkeletonRows } from "./states";
import { toneClasses } from "./tones";

const SUBTITLES = {
  device: "Closest to your location",
  saved: "Closest to your saved location",
  none: "Newest first",
};

function describe(item, now) {
  const { kind, record, distanceKm } = item;
  const away = distanceKm === null ? null : `${formatDistance(distanceKm)} away`;

  if (kind === "shelter") {
    const free = record.capacity - record.occupied;
    return {
      icon: <Icon name="house-plus" className="size-5" />,
      tone: "green",
      title: record.name,
      detail: [away, `${free.toLocaleString("en-US")} ${free === 1 ? "space" : "spaces"} free`].filter(Boolean).join(" · "),
      action: { label: "View", href: mapHref("shelter", record._id) },
    };
  }

  const { label, icon: TypeIcon } = incidentTypeMeta(record.type);
  return {
    icon: <TypeIcon className="size-5" aria-hidden="true" />,
    tone: "red",
    title: `${label} · ${capitalize(record.severity)}`,
    detail: [away ?? formatRelativeTime(record.createdAt, now), record.address || record.description].join(" · "),
    action: { label: "Details", href: mapHref("incident", record._id) },
  };
}

export default function NearbyCard({ shelters, incidents, place, className = "" }) {
  const waiting = (shelters.loading && !shelters.data) || (incidents.loading && !incidents.data);
  const failed = !shelters.data && !incidents.data && !waiting;
  const now = incidents.fetchedAt ?? shelters.fetchedAt ?? 0;

  const items = useMemo(
    () => buildNearbyItems({ shelters: shelters.data ?? [], incidents: incidents.data ?? [], location: place.location }),
    [shelters.data, incidents.data, place.location],
  );

  const subtitle = place.locating && place.source !== "device" ? "Locating you…" : SUBTITLES[place.source];

  return (
    <Card className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-xl font-bold tracking-tight">Nearby</h2>
        <p className="text-xs text-ink-muted">{subtitle}</p>
      </div>

      <div className="mt-4">
        {waiting && <SkeletonRows rows={3} />}
        {failed && (
          <ErrorState
            message={shelters.error ?? incidents.error}
            onRetry={() => {
              shelters.refresh();
              incidents.refresh();
            }}
          />
        )}
        {!waiting && !failed && items.length === 0 && (
          <EmptyState icon="house-plus" title="Nothing to show yet" hint="Open shelters and active incidents will appear here as they are added." />
        )}
        {!waiting && items.length > 0 && (
          <ul className="flex flex-col gap-3">
            {items.map((item) => {
              const view = describe(item, now);
              return (
                <li key={`${item.kind}-${item.id}`} data-kind={item.kind} data-id={item.id} className="flex items-center gap-3 rounded-2xl border border-line bg-white/5 p-3">
                  <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${toneClasses(view.tone).badge}`}>{view.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{view.title}</p>
                    <p className="text-xs text-ink-muted">{view.detail}</p>
                  </div>
                  <Link
                    href={view.action.href}
                    aria-label={`${view.action.label}: ${view.title}`}
                    className="shrink-0 rounded-xl border border-line-strong bg-white/5 px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-white/10 motion-safe:active:scale-95"
                  >
                    {view.action.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
