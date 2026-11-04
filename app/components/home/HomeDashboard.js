"use client";

import { fetchIncidents, fetchShelters, fetchStats } from "@/lib/api";
import SavedDataBanner, { oldestSavedAt } from "@/components/SavedDataBanner";
import usePolledResource from "@/components/usePolledResource";
import useUserLocation from "@/components/useUserLocation";
import ActivityCard from "./ActivityCard";
import Hero from "./Hero";
import NearbyCard from "./NearbyCard";
import QuickActions from "./QuickActions";
import StatsRow from "./StatsRow";
import StatusStrip from "./StatusStrip";

// The grid reacts to this wrapper's width (container queries), not the viewport:
// the sidebar takes 18rem on desktop, so viewport breakpoints would be too early.
// DOM order is the single-column (mobile) order; `order-*` rearranges it on desktop.
// Everything refreshes every 30 s while the tab is visible (usePolledResource).
export default function HomeDashboard() {
  const stats = usePolledResource(fetchStats);
  const incidents = usePolledResource(fetchIncidents);
  const shelters = usePolledResource(fetchShelters);
  const place = useUserLocation();

  const staleData = [stats, incidents, shelters].some((resource) => resource.data && resource.error);

  return (
    <div className="@container">
      <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-12">
        <SavedDataBanner savedAt={oldestSavedAt(stats, incidents, shelters)} className="@3xl:order-1 @3xl:col-span-12" />
        <StatusStrip resource={stats} className="@3xl:order-1 @3xl:col-span-12" />
        <Hero className="@3xl:order-2 @3xl:col-span-7" />
        <StatsRow resource={stats} className="@3xl:order-4 @3xl:col-span-12" />
        <QuickActions className="@3xl:order-3 @3xl:col-span-5" />
        {/* Nearby and Recent activity: stacked on phones (Nearby first), side by side from 1024px. */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 @3xl:order-5 @3xl:col-span-12">
          <NearbyCard shelters={shelters} incidents={incidents} place={place} />
          <ActivityCard incidents={incidents} />
        </div>
        {staleData && (
          <p role="status" className="text-xs font-medium text-warn @3xl:order-8 @3xl:col-span-12">
            {"Couldn't refresh just now. Showing the last data we have."}
          </p>
        )}
      </div>
    </div>
  );
}
