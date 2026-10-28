"use client";

import { useMemo } from "react";
import { LoaderCircle, LocateOff, MapPinOff, TriangleAlert } from "lucide-react";
import { formatDistance } from "@/lib/geo";
import { stepStarts } from "@/lib/routing/navigation";
import StepIcon from "./StepIcon";

// What to say, in a few words, when the phone cannot follow the person's position.
const FOLLOW_ERROR_TEXT = {
  denied: "Location is off for RescueNet",
  unsupported: "This device can't follow your position",
  timeout: "Waiting for a GPS signal",
  unavailable: "Waiting for a GPS signal",
};

// The one small banner shown under the instruction card, most urgent first: finding a new
// route, no position, off the route, waiting for the first position, then the one warning
// that must not be missed. It goes away on its own when the situation does (after the
// reroute the person is on the new route, so "off the route" is gone).
function bannerFor({ following, rerouting, progress, followError, warnings }) {
  if (following && rerouting) return { id: "rerouting", tone: "info", text: "Finding a new route…", spinner: true };
  if (following && followError) return { id: "no-position", tone: "warn", text: FOLLOW_ERROR_TEXT[followError] ?? "Can't follow your position", icon: LocateOff };
  if (following && progress?.offRoute) return { id: "off-route", tone: "warn", text: "You are off the route", icon: MapPinOff };
  if (following && !progress) return { id: "waiting", tone: "info", text: "Waiting for your position…", spinner: true };
  if (warnings.some((w) => w.id === "no-safe-route")) return { id: "no-safe-route", tone: "warn", text: "No route avoids reported danger. Tap for details", icon: TriangleAlert, opensDirections: true };
  if (warnings.some((w) => w.id === "active-incident")) return { id: "active-incident", tone: "warn", text: "Active incident. Keep a safe distance. Call 112 if in danger", icon: TriangleAlert, opensDirections: true };
  return null;
}

const BANNER_TONE = {
  info: "border-info/50 text-ink",
  warn: "border-warn/60 text-ink",
};

// The top of the map while a route is on screen: a compact card with the next instruction
// (what to do, and how far away it is), flush with the top edge of the map so it takes as
// little of the map as it can, and under it the one small status banner when there is one.
//   nav                from useNavigation
//   onOpenDirections   opens the directions sheet (the "no safe route" banner uses it)
export default function NavigationTop({ nav, onOpenDirections }) {
  const { steps, progress, following, rerouting, followError, warnings, arrived } = nav;
  const starts = useMemo(() => stepStarts(steps), [steps]);
  const index = progress?.stepIndex ?? 0;
  const step = steps[index];
  const away = following && progress ? Math.max(0, starts[index + 1] - progress.alongM) : step.distanceM;
  const banner = bannerFor({ following, rerouting, progress, followError, warnings });
  const BannerIcon = banner?.icon;

  return (
    <>
      <div
        data-nav="instruction"
        className="rn-safe-x pointer-events-auto w-full border-b border-line-strong bg-surface-raised/95 py-1.5 shadow-card backdrop-blur-xl md:ml-3 md:w-[30rem] md:max-w-[calc(100%-6rem)] md:self-start md:rounded-b-2xl md:border-x"
      >
        <div className="flex items-center gap-3">
          <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${arrived ? "bg-safe/20 text-safe" : "bg-info/20 text-info"}`}>
            <StepIcon maneuver={step.maneuver} className="size-5" />
          </span>
          <p
            data-clamp="2"
            title={step.text}
            aria-live={following ? "polite" : undefined}
            className="line-clamp-2 min-w-0 flex-1 text-sm leading-snug font-semibold break-words"
          >
            {step.text}
          </p>
          {step.maneuver !== "arrive" && (
            <p className="shrink-0 pl-1 text-right font-display text-lg leading-none font-bold tabular-nums">{formatDistance(away / 1000)}</p>
          )}
        </div>
      </div>

      {banner && (
        <div className="rn-safe-x pointer-events-none flex w-full justify-center pt-1.5 md:justify-start">
          {banner.opensDirections ? (
            <button
              type="button"
              onClick={onOpenDirections}
              className={`pointer-events-auto flex max-w-full items-center gap-2 rounded-2xl border bg-surface-raised/95 px-3 py-1 text-center text-xs leading-snug font-bold shadow-card-hover backdrop-blur-xl ${BANNER_TONE[banner.tone]}`}
            >
              <BannerIcon className="size-4 shrink-0 text-warn" aria-hidden="true" />
              <span className="min-w-0">{banner.text}</span>
            </button>
          ) : (
            <p
              role="status"
              data-banner={banner.id}
              className={`flex max-w-full items-center gap-2 rounded-2xl border bg-surface-raised/95 px-3 py-1 text-center text-xs leading-snug font-bold shadow-card-hover backdrop-blur-xl ${BANNER_TONE[banner.tone]}`}
            >
              {banner.spinner ? (
                <LoaderCircle className="size-4 shrink-0 text-info motion-safe:animate-spin" aria-hidden="true" />
              ) : (
                <BannerIcon className="size-4 shrink-0 text-warn" aria-hidden="true" />
              )}
              <span className="min-w-0">{banner.text}</span>
            </p>
          )}
        </div>
      )}
    </>
  );
}
