"use client";

import { fetchIncidents, fetchShelters, fetchStats } from "@/lib/api";
import usePolledResource from "@/components/usePolledResource";
import useUserLocation from "@/components/useUserLocation";
import ActivityCard from "./ActivityCard";
import Hero from "./Hero";
import MiniMap from "./MiniMap";
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
        <StatusStrip resource={stats} className="@3xl:order-1 @3xl:col-span-12" />
        <Hero className="@3xl:order-2 @3xl:col-span-7" />
        <StatsRow resource={stats} className="@3xl:order-4 @3xl:col-span-12" />
        <QuickActions className="@3xl:order-3 @3xl:col-span-5" />
        <NearbyCard shelters={shelters} incidents={incidents} place={place} className="@3xl:order-6 @3xl:col-span-6" />
        <ActivityCard incidents={incidents} className="@3xl:order-7 @3xl:col-span-6" />
        <MiniMap incidents={incidents} shelters={shelters} className="@3xl:order-5 @3xl:col-span-6 @3xl:row-span-2" />
        {staleData && (
          <p role="status" className="text-xs font-medium text-warn @3xl:order-8 @3xl:col-span-12">
            {"Couldn't refresh just now. Showing the last data we have."}
          </p>
        )}
      </div>
    </div>
  );
}
