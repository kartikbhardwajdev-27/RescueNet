"use client";

import { useMemo, useState } from "react";
import {
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  Car,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CornerDownLeft,
  CornerDownRight,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  Footprints,
  LoaderCircle,
  Navigation,
  Play,
  RefreshCw,
  RotateCw,
  Square,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";
import NearestPanel, { nearestPanelButtonClass } from "@/components/shelters/NearestPanel";
import NearIncidentBadge from "@/components/shelters/NearIncidentBadge";
import { describeLocationError, formatDistance } from "@/lib/geo";
import { ESTIMATE_NOTE, fallbackMessage, formatDuration, LIMITS_NOTE } from "@/lib/routing/navigation";

const PANEL = "pointer-events-auto w-full max-w-md rounded-2xl border border-line-strong bg-surface-raised/95 p-3.5 shadow-card-hover backdrop-blur-xl";

const MANEUVER_ICON = {
  depart: Navigation,
  straight: ArrowUp,
  "bear-left": ArrowUpLeft,
  "bear-right": ArrowUpRight,
  left: CornerUpLeft,
  right: CornerUpRight,
  "sharp-left": CornerDownLeft,
  "sharp-right": CornerDownRight,
  uturn: Undo2,
  roundabout: RotateCw,
  "roundabout-exit": ArrowUpRight,
  arrive: Flag,
};

function StepIcon({ maneuver, className = "size-5" }) {
  const Icon = MANEUVER_ICON[maneuver] ?? ArrowUp;
  return <Icon className={className} aria-hidden="true" />;
}

const SEGMENT = "flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold transition-colors";

function ProfileToggle({ profile, onChange, disabled }) {
  const options = [
    { value: "walk", label: "Walk", icon: Footprints },
    { value: "drive", label: "Drive", icon: Car },
  ];
  return (
    <div role="radiogroup" aria-label="How you are travelling" className="flex gap-1 rounded-2xl border border-line bg-black/20 p-1">
      {options.map(({ value, label, icon: Icon }) => {
        const selected = profile === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(value)}
            className={`${SEGMENT} disabled:opacity-60 ${selected ? "bg-brand-gradient text-on-brand shadow-brand" : "text-ink-muted hover:bg-white/10 hover:text-ink"}`}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

function Warning({ warning }) {
  return (
    <div role={warning.id === "no-safe-route" ? "alert" : "status"} className="flex items-start gap-2.5 rounded-xl border border-warn/40 bg-warn/10 p-2.5 text-sm">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-bold">{warning.title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{warning.detail}</p>
      </div>
    </div>
  );
}

// Metres from the start of the route to the start of each step (and to the end).
function stepStarts(steps) {
  const starts = [0];
  for (const step of steps) starts.push(starts[starts.length - 1] + step.distanceM);
  return starts;
}

// The road route to a shelter: how far, how long (an estimate), Walk or Drive, anything to be
// careful about, and the turn-by-turn list. In "Start" mode it also says what to do next.
function RoutePanel({ nav, destinationWarning, incidentsKnown, onShowShelter }) {
  const { request, outcome, route, steps, profile, progress, following, arrived, rerouting, followError, destination, warnings, computing } = nav;
  const [showSteps, setShowSteps] = useState(false);
  const starts = useMemo(() => stepStarts(steps), [steps]);

  const totalKm = route.distanceM / 1000;
  const remainingM = progress ? progress.remainingM : route.distanceM;
  const remainingS = route.distanceM > 0 ? route.durationS * (remainingM / route.distanceM) : 0;
  const currentIndex = progress?.stepIndex ?? 0;
  const current = steps[currentIndex];
  const toNextM = progress ? Math.max(0, starts[currentIndex + 1] - progress.alongM) : current.distanceM;
  const name = destination?.name ?? "the shelter";
  const label = request.mode === "nearest" ? "Nearest shelter by road" : "Directions to shelter";
  const critical = warnings.filter((w) => w.id === "no-safe-route");
  const others = warnings.filter((w) => w.id !== "no-safe-route");

  // In "Start" mode the next instruction comes first: it is what the person looks at.
  const nextBanner = following && (
    <div aria-live="polite" className="mt-3 flex items-center gap-3 rounded-xl bg-info/15 p-3">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-info/25 text-info">
        <StepIcon maneuver={current.maneuver} className="size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug font-bold break-words">{current.text}</p>
        {current.maneuver !== "arrive" && (
          <p className="mt-0.5 text-xs text-ink-muted">{progress ? `Next in ${formatDistance(toNextM / 1000)}` : `Then ${formatDistance(current.distanceM / 1000)}`}</p>
        )}
      </div>
    </div>
  );

  // The order matters on a phone, where only the top of this panel is on screen: who and how far,
  // the one warning that must not be missed, then the buttons. Everything else follows.
  return (
    <div role="region" aria-label="Road directions" className={`${PANEL} max-h-[max(10rem,calc(100dvh-30rem))] overflow-y-auto md:max-h-[calc(100dvh-14rem)]`}>
      <div className="flex items-start gap-3">
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${critical.length > 0 ? "bg-warn/15 text-warn" : "bg-safe/15 text-safe"}`}>
          <Navigation className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">{label}</p>
          <h2 className="mt-0.5 font-display text-base leading-tight font-bold break-words">{name}</h2>
        </div>
        <button
          type="button"
          onClick={nav.clear}
          aria-label="Close directions"
          className="-mt-1 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-white/10 hover:text-ink"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      {nextBanner}
      {arrived && (
        <p role="status" className="mt-3 flex items-center gap-2.5 rounded-xl border border-safe/40 bg-safe/10 p-2.5 text-sm font-bold">
          <CheckCircle2 className="size-5 shrink-0 text-safe" aria-hidden="true" />
          You have arrived at {name}
        </p>
      )}
      {following && !progress && <p className="mt-2 text-xs text-ink-muted">Waiting for your position…</p>}
      {following && rerouting && (
        <p role="status" className="mt-2 flex items-center gap-2 text-xs font-semibold text-info">
          <RefreshCw className="size-3.5 motion-safe:animate-spin" aria-hidden="true" />
          You left the route. Finding a new one…
        </p>
      )}
      {following && !rerouting && progress?.offRoute && <p className="mt-2 text-xs font-semibold text-warn">You are off the route.</p>}
      {followError && <p className="mt-2 text-xs text-warn">Couldn&apos;t follow your position: {describeLocationError(followError)}</p>}

      <div className="mt-3 flex items-end justify-between gap-3" aria-live="polite">
        <div>
          <p className="font-display text-2xl leading-none font-bold">
            {formatDistance(remainingM / 1000)}
            <span className="mx-2 font-normal text-ink-muted">·</span>
            {formatDuration(remainingS)}
          </p>
          <p className="mt-1.5 text-xs text-ink-muted">
            <span className="font-semibold text-ink">Estimate</span>, {profile === "walk" ? "on foot" : "by car"}. No live traffic.
            {progress ? ` ${formatDistance(totalKm)} in all.` : ""}
            {request.mode === "nearest" && outcome.tried.length > 1 && !following ? ` Shortest by road of the ${outcome.tried.length} nearest open shelters with room.` : ""}
          </p>
        </div>
        {computing && <LoaderCircle className="mb-1 size-5 shrink-0 text-ink-muted motion-safe:animate-spin" aria-label="Updating the route" />}
      </div>

      {critical.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {critical.map((warning) => (
            <Warning key={warning.id} warning={warning} />
          ))}
        </div>
      )}

      <div className="mt-3">
        <ProfileToggle profile={profile} onChange={nav.setProfile} disabled={computing} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {following ? (
          <button type="button" onClick={nav.stopFollowing} className={`${nearestPanelButtonClass} min-h-10 px-4 text-sm`}>
            <Square className="size-3.5" aria-hidden="true" />
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={nav.startFollowing}
            disabled={arrived}
            className="flex min-h-10 items-center gap-2 rounded-xl bg-brand-gradient px-4 text-sm font-bold text-on-brand shadow-brand transition-all duration-150 hover:brightness-110 disabled:opacity-60 motion-safe:active:scale-95"
          >
            <Play className="size-4" aria-hidden="true" />
            Start
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowSteps((open) => !open)}
          aria-expanded={showSteps}
          className={`${nearestPanelButtonClass} min-h-10 px-3 text-sm`}
        >
          {showSteps ? <ChevronUp className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}
          Directions ({steps.length - 1})
        </button>
        {destination && (
          <button type="button" onClick={() => onShowShelter(destination._id)} className={`${nearestPanelButtonClass} min-h-10 px-3 text-sm`}>
            Shelter details
          </button>
        )}
      </div>

      {(others.length > 0 || destinationWarning || !incidentsKnown) && (
        <div className="mt-3 flex flex-col gap-2">
          {others.map((warning) => (
            <Warning key={warning.id} warning={warning} />
          ))}
          {destinationWarning && (
            <p>
              <NearIncidentBadge warning={destinationWarning} withDistance />
            </p>
          )}
          {!incidentsKnown && <p className="text-xs text-warn">Couldn&apos;t check for nearby incidents.</p>}
        </div>
      )}

      {showSteps && (
        <>
          <ol aria-label="Turn-by-turn directions" className="mt-3 flex flex-col gap-1">
            {steps.map((step, index) => {
              const isCurrent = following && index === currentIndex;
              return (
                <li
                  key={step.index}
                  aria-current={isCurrent ? "step" : undefined}
                  className={`flex items-start gap-3 rounded-xl px-2.5 py-2 ${isCurrent ? "bg-info/15 ring-1 ring-info/60" : "bg-white/5"}`}
                >
                  <span className={`mt-0.5 shrink-0 ${step.maneuver === "arrive" ? "text-safe" : "text-ink-muted"}`}>
                    <StepIcon maneuver={step.maneuver} />
                  </span>
                  <span className="min-w-0 flex-1 text-sm leading-snug break-words">{step.text}</span>
                  {step.distanceM > 0 && <span className="shrink-0 text-xs font-semibold text-ink-muted tabular-nums">{formatDistance(step.distanceM / 1000)}</span>}
                </li>
              );
            })}
          </ol>
          <p className="mt-2 text-xs leading-relaxed text-ink-muted">
            {ESTIMATE_NOTE} {LIMITS_NOTE} Street names come from OpenStreetMap; many roads here have none.
          </p>
        </>
      )}
    </div>
  );
}

// What the "Navigate" buttons show on the map: the road route, or why there is not one
// (no location, no shelter free, road data missing, outside the mapped area) and the
// straight-line guidance instead.
//   nav               from useNavigation
//   destinationWarning  { count, nearestKm } if the shelter is within 2 km of an active
//                       high or critical incident, else undefined
//   incidentsKnown      the incident list has loaded
//   onShowShelter(id)   opens the shelter's popup
export default function NavigationPanel({ nav, destinationWarning, incidentsKnown, onShowShelter }) {
  const { outcome, request } = nav;
  if (!outcome || outcome.status === "locating") return null;

  if (outcome.status === "ok") {
    return <RoutePanel nav={nav} destinationWarning={destinationWarning} incidentsKnown={incidentsKnown} onShowShelter={onShowShelter} />;
  }

  if (outcome.status === "need-location") {
    return <NearestPanel request={{ phase: "need-location", code: outcome.code }} onClear={nav.clear} onRetry={nav.retry} />;
  }

  if (outcome.status === "gone") {
    return (
      <div role="region" aria-label="Road directions" aria-live="polite" className={PANEL}>
        <div className="flex items-start gap-3">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden="true" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-bold">That shelter isn&apos;t in the list any more</p>
            <p className="mt-1 text-ink-muted">It may have been removed. Try &quot;Navigate to nearest shelter&quot; instead.</p>
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
