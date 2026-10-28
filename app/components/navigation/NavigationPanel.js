"use client";

import { Compass, RefreshCw, TriangleAlert, X } from "lucide-react";
import NearestPanel, { nearestPanelButtonClass } from "@/components/shelters/NearestPanel";
import { formatDistance } from "@/lib/geo";
import { STRAIGHT_LINE_NOTE, compassWord } from "@/lib/nearest";
import { ACTIVE_INCIDENT_NOTE, fallbackMessage, isActiveIncident } from "@/lib/routing/navigation";

const PANEL = "pointer-events-auto w-full max-w-md rounded-2xl border border-line-strong bg-surface-raised/95 p-3.5 shadow-card-hover backdrop-blur-xl";

// What the "Navigate" buttons show on the map when there is NOT a road route: why not (no
// location, no shelter free, road data missing, outside the mapped area) and the straight-line
// guidance instead. A road route itself is shown by NavigationTop and NavigationBottom, so for
// that case this renders nothing.
//   nav               from useNavigation
//   incidentsKnown      the incident list has loaded
//   onShowShelter(id)   opens the shelter's popup
export default function NavigationPanel({ nav, incidentsKnown, onShowShelter }) {
  const { outcome, request } = nav;
  if (!outcome || outcome.status === "locating") return null;

  if (outcome.status === "ok") return null;

  if (outcome.status === "need-location") {
    return <NearestPanel request={{ phase: "need-location", code: outcome.code }} onClear={nav.clear} onRetry={nav.retry} />;
  }

  if (outcome.status === "gone") {
    return (
      <div role="region" aria-label="Road directions" aria-live="polite" className={PANEL}>
        <div className="flex items-start gap-3">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden="true" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-bold">{request?.mode === "incident" ? "That incident isn't in the list any more" : "That shelter isn't in the list any more"}</p>
            <p className="mt-1 text-ink-muted">
              {request?.mode === "incident" ? "It may have been removed." : "It may have been removed. Try \"Navigate to nearest shelter\" instead."}
            </p>
          </div>
          <button type="button" onClick={nav.clear} aria-label="Close directions" className="-mt-1 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-xl text-ink-muted hover:bg-white/10 hover:text-ink">
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  if (request?.mode === "incident") {
    // No road route to an incident: the straight line, with the safety note for an active one.
    const guidance = nav.incidentFallback;
    const retryable = ["failed", "no-route", "graph-corrupt", "graph-missing"].includes(outcome.code);
    const where = !guidance ? null : guidance.direction ? `${formatDistance(guidance.distanceKm)} ${compassWord(guidance.direction)} (${guidance.direction}) of ${guidance.source === "saved" ? "your saved location" : "you"}` : "You are already here";
    return (
      <div role="region" aria-label="Road directions" aria-live="polite" className={PANEL}>
        <div className="flex items-start gap-3">
          <Compass className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden="true" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-bold">No road directions to this incident</p>
            <p className="mt-1 text-ink-muted">{fallbackMessage(outcome.code)}</p>
            {where && (
              <p className="mt-2 font-semibold">
                {where}
                <span className="block text-xs font-normal text-ink-muted">{STRAIGHT_LINE_NOTE}</span>
              </p>
            )}
            {isActiveIncident(nav.destinationIncident) && <p className="mt-2 text-xs font-semibold text-warn">{ACTIVE_INCIDENT_NOTE}</p>}
            {retryable && (
              <button type="button" onClick={nav.retry} className={`${nearestPanelButtonClass} mt-3`}>
                <RefreshCw className="size-3.5" aria-hidden="true" />
                Try again
              </button>
            )}
          </div>
          <button type="button" onClick={nav.clear} aria-label="Close directions" className="-mt-1 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-xl text-ink-muted hover:bg-white/10 hover:text-ink">
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  // "none", or "fallback": the straight-line guidance (a missing guidance means no shelter is open with room).
  const guidance = outcome.status === "fallback" ? nav.fallbackGuidance : null;
  return (
    <NearestPanel
      request={{ phase: "ready" }}
      guidance={guidance}
      incidentsKnown={incidentsKnown}
      onClear={nav.clear}
      onRetry={nav.retry}
      heading={request?.mode === "shelter" ? "Shelter" : "Nearest open shelter"}
      notice={outcome.status === "fallback" ? `No road directions: ${fallbackMessage(outcome.code)}` : null}
    >
      {guidance && (
        <button type="button" onClick={() => onShowShelter(guidance.shelter._id)} className={nearestPanelButtonClass}>
          Shelter details
        </button>
      )}
      {outcome.status === "fallback" && ["failed", "no-route", "graph-corrupt", "graph-missing"].includes(outcome.code) && (
        <button type="button" onClick={nav.retry} className={nearestPanelButtonClass}>
          <RefreshCw className="size-3.5" aria-hidden="true" />
          Try again
        </button>
      )}
    </NearestPanel>
  );
}
