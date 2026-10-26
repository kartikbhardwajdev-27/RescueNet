"use client";

import { useEffect, useMemo, useRef } from "react";
import { Car, ChevronDown, ChevronUp, Footprints, MapPin, Play, Square, TriangleAlert } from "lucide-react";
import NearIncidentBadge from "@/components/shelters/NearIncidentBadge";
import { formatDistance } from "@/lib/geo";
import { ESTIMATE_NOTE, formatDuration, LIMITS_NOTE } from "@/lib/routing/navigation";
import { RoundLocateButton } from "@/components/map/MapOverlays";
import StepIcon from "./StepIcon";

// Walk or Drive: two icon buttons that fit in the strip's top row. Icons only, so each
// has a text label for screen readers and a tooltip.
function ProfileToggle({ profile, onChange, disabled }) {
  const options = [
    { value: "walk", label: "Walk", icon: Footprints },
    { value: "drive", label: "Drive", icon: Car },
  ];
  return (
    <div role="radiogroup" aria-label="How you are travelling" className="flex shrink-0 gap-0.5 rounded-xl border border-line bg-black/20 p-0.5">
      {options.map(({ value, label, icon: Icon }) => {
        const selected = profile === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            title={label}
            disabled={disabled}
            onClick={() => onChange(value)}
            className={`flex size-9 items-center justify-center rounded-[10px] transition-colors disabled:opacity-60 ${
              selected ? "bg-brand-gradient text-on-brand shadow-brand" : "text-ink-muted hover:bg-white/10 hover:text-ink"
            }`}
          >
            <Icon className="size-[18px]" aria-hidden="true" />
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

// Keeps the map's own controls clear of the strip: tells the map card how tall the strip is
// (the attribution sits just above it), and forgets it when the strip goes away.
function useReportedHeight(ref) {
  useEffect(() => {
    const element = ref.current;
    const card = element?.closest(".rn-map");
    if (!element || !card) return undefined;
    const report = () => card.style.setProperty("--rn-nav-bottom", `${Math.ceil(element.getBoundingClientRect().height)}px`);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(element);
    card.classList.add("is-navigating");
    return () => {
      observer.disconnect();
      card.classList.remove("is-navigating");
      card.style.removeProperty("--rn-nav-bottom");
    };
  }, [ref]);
}

// The bottom of the map while a route is on screen. Collapsed it is a slim strip:
//
//   [pin] Destination name (one line, ellipsis)            [!]  [v]
//   8.7 km · ≈ 1 h 49 min                               [walk|drive]
//   Estimate · on foot · no live traffic
//   [          Start          ] [Stop]      (just [   Stop   ] once following)
//
// The chevron opens the directions as a sheet inside the strip (warnings, then the steps),
// which scrolls inside itself and never covers more than 45% of the screen. Above the strip,
// at the right edge, is the one round "My location" / "Re-centre" button.
//
//   nav               from useNavigation
//   open, onToggle    whether the directions sheet is open (kept by the map)
//   onLocate          the round button's action; locateLabel and locating describe it
//   destinationLabel  what the one-line name says
//   destinationWarning, incidentsKnown, onShowDetails   as before
export default function NavigationBottom({ nav, open, onToggle, onLocate, locateLabel, locating, destinationLabel, destinationWarning, incidentsKnown, onShowDetails, detailsLabel = "Details" }) {
  const { request, outcome, route, steps, profile, progress, following, arrived, warnings, computing } = nav;
  const sectionRef = useRef(null);
  useReportedHeight(sectionRef);

  const remainingM = progress ? progress.remainingM : route.distanceM;
  const remainingS = route.distanceM > 0 ? route.durationS * (remainingM / route.distanceM) : 0;
  const currentIndex = progress?.stepIndex ?? 0;
  const warningCount = warnings.length + (destinationWarning ? 1 : 0);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onToggle();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onToggle]);

  const Chevron = open ? ChevronDown : ChevronUp;
  const kindOfTrip = profile === "walk" ? "on foot" : "by car";

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-end">
      <div className="rn-safe-right pointer-events-auto mb-2">
        <RoundLocateButton onClick={onLocate} locating={locating} label={locateLabel} />
      </div>

      <section
        ref={sectionRef}
        data-nav="strip"
        aria-label="Route summary"
        className="pointer-events-auto flex max-h-[45dvh] w-full flex-col border-t border-line-strong bg-surface-raised/95 shadow-card-hover backdrop-blur-xl md:mb-3 md:ml-3 md:w-[30rem] md:max-w-[calc(100%-6rem)] md:self-start md:rounded-2xl md:border"
      >
        <div className="rn-safe-x rn-safe-bottom shrink-0 pt-1.5">
          <div className="flex h-9 items-center gap-2">
            <MapPin className="size-4 shrink-0 text-safe" aria-hidden="true" />
            <p data-truncates title={destinationLabel} className="min-w-0 flex-1 truncate font-display text-sm font-bold">
              {destinationLabel}
            </p>
            {warningCount > 0 && (
              <button
                type="button"
                onClick={() => !open && onToggle()}
                aria-label={`${warningCount} ${warningCount === 1 ? "warning" : "warnings"}. Open directions`}
                className="flex h-9 shrink-0 items-center gap-1 rounded-xl border border-warn/50 bg-warn/10 px-2 text-xs font-bold text-warn"
              >
                <TriangleAlert className="size-4" aria-hidden="true" />
                {warningCount}
              </button>
            )}
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={open}
              aria-controls="nav-sheet"
              aria-label={open ? "Hide directions" : "Show directions"}
              className="flex size-9 shrink-0 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-white/10 hover:text-ink"
            >
              <Chevron className="size-5" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-0.5 flex min-h-9 items-center gap-3">
            <div className="min-w-0 flex-1" aria-live="polite">
              <p className="font-display text-[17px] leading-tight font-bold">
                {formatDistance(remainingM / 1000)}
                <span className="mx-1.5 font-normal text-ink-muted">·</span>
                {formatDuration(remainingS)}
              </p>
              <p className="text-[11px] leading-tight text-ink-muted">
                <span className="font-semibold text-ink">Estimate</span> · {kindOfTrip} · no live traffic
              </p>
            </div>
            <ProfileToggle profile={profile} onChange={nav.setProfile} disabled={computing} />
          </div>

          <div className="mt-1.5 flex h-10 items-center gap-2">
            {!following && (
              <button
                type="button"
                onClick={nav.startFollowing}
                disabled={arrived}
                className="flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-gradient px-4 text-sm font-bold text-on-brand shadow-brand transition-all duration-150 hover:brightness-110 disabled:opacity-60 motion-safe:active:scale-95"
              >
                <Play className="size-4" aria-hidden="true" />
                Start
              </button>
            )}
            <button
              type="button"
              onClick={nav.clear}
              className={`flex h-10 items-center justify-center gap-2 rounded-xl border border-line-strong bg-white/5 px-4 text-sm font-bold transition-colors hover:bg-white/10 motion-safe:active:scale-95 ${following ? "min-w-0 flex-1" : "shrink-0"}`}
            >
              <Square className="size-3.5" aria-hidden="true" />
              Stop
            </button>
          </div>
        </div>

        {open && <DirectionsSheet nav={nav} request={request} outcome={outcome} steps={steps} following={following} currentIndex={currentIndex} warnings={warnings} destinationWarning={destinationWarning} incidentsKnown={incidentsKnown} onShowDetails={onShowDetails} detailsLabel={detailsLabel} />}
      </section>
    </div>
  );
}

// The full directions: what to be careful about, then every step. Scrolls inside itself.
function DirectionsSheet({ request, outcome, steps, following, currentIndex, warnings, destinationWarning, incidentsKnown, onShowDetails, detailsLabel }) {
  const currentRef = useRef(null);
  const nearestNote = useMemo(
    () => (request.mode === "nearest" && outcome.tried.length > 1 ? `Shortest by road of the ${outcome.tried.length} nearest open shelters with room.` : null),
    [request.mode, outcome.tried],
  );

  // While following, keep the current step in view inside the sheet.
  useEffect(() => {
    if (following) currentRef.current?.scrollIntoView({ block: "nearest" });
  }, [following, currentIndex]);

  return (
    <div id="nav-sheet" role="region" aria-label="Directions" className="rn-safe-x min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-line py-3">
      {(warnings.length > 0 || destinationWarning || !incidentsKnown) && (
        <div className="mb-3 flex flex-col gap-2">
          {warnings.map((warning) => (
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
      {nearestNote && <p className="mb-2 text-xs text-ink-muted">{nearestNote}</p>}

      <ol aria-label="Turn-by-turn directions" className="flex flex-col gap-1">
        {steps.map((step, index) => {
          const isCurrent = following && index === currentIndex;
          return (
            <li
              key={step.index}
              ref={isCurrent ? currentRef : undefined}
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

      {onShowDetails && (
        <button
          type="button"
          onClick={onShowDetails}
          className="mt-3 flex min-h-10 items-center rounded-xl border border-line-strong bg-white/5 px-3 text-sm font-bold transition-colors hover:bg-white/10"
        >
          {detailsLabel}
        </button>
      )}
      <p className="mt-3 text-xs leading-relaxed text-ink-muted">
        {ESTIMATE_NOTE} {LIMITS_NOTE} Street names come from OpenStreetMap; many roads here have none.
      </p>
    </div>
  );
}
