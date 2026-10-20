import ActivityCard from "@/components/home/ActivityCard";
import Hero from "@/components/home/Hero";
import MiniMap from "@/components/home/MiniMap";
import NearbyCard from "@/components/home/NearbyCard";
import QuickActions from "@/components/home/QuickActions";
import StatsRow from "@/components/home/StatsRow";
import StatusStrip from "@/components/home/StatusStrip";
import {
  activity,
  emergencyStatus,
  mapLegend,
  mapMarkers,
  nearby,
  quickActions,
  stats,
} from "@/lib/mockData";

// The grid reacts to this wrapper's width (container queries), not the viewport:
// the sidebar takes 18rem on desktop, so viewport breakpoints would be too early.
// DOM order is the single-column (mobile) order; `order-*` rearranges it on desktop.
export default function HomePage() {
  return (
    <div className="@container">
      <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-12">
        <StatusStrip status={emergencyStatus} className="@3xl:order-1 @3xl:col-span-12" />
        <Hero className="@3xl:order-2 @3xl:col-span-7" />
        <StatsRow stats={stats} className="@3xl:order-4 @3xl:col-span-12" />
        <QuickActions actions={quickActions} className="@3xl:order-3 @3xl:col-span-5" />
        <NearbyCard items={nearby} className="@3xl:order-6 @3xl:col-span-6" />
        <ActivityCard items={activity} className="@3xl:order-7 @3xl:col-span-6" />
        <MiniMap
          markers={mapMarkers}
          legend={mapLegend}
          className="@3xl:order-5 @3xl:col-span-6 @3xl:row-span-2"
        />
      </div>
    </div>
  );
}
