import { Compass, MapPinOff, RefreshCw, X } from "lucide-react";
import { describeLocationError, formatDistance } from "@/lib/geo";
import { NEED_LOCATION_MESSAGE, STRAIGHT_LINE_NOTE, compassWord } from "@/lib/nearest";
import NearIncidentBadge from "./NearIncidentBadge";

const PANEL = "pointer-events-auto w-full max-w-md rounded-2xl border border-line-strong bg-surface-raised/95 p-3.5 shadow-card-hover backdrop-blur-xl";
const SMALL_BUTTON =
  "flex shrink-0 items-center gap-1.5 rounded-xl border border-line-strong bg-white/5 px-3 py-1.5 text-xs font-bold transition-colors hover:bg-white/10 motion-safe:active:scale-95";

function CloseButton({ onClear }) {
  return (
    <button
      type="button"
      onClick={onClear}
      aria-label="Close nearest shelter"
      className="-mt-1 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-white/10 hover:text-ink"
    >
      <X className="size-4" aria-hidden="true" />
    </button>
  );
}

// What "Nearest shelter" found, for the map and the shelter list.
//   request, guidance, incidentsKnown   from useNearestShelter
//   onClear                              closes the panel
//   onRetry                              asks again (offered when location was refused)
//   children                             extra buttons ("Show details", "Show on map")
// Always says it is a straight line: nothing here knows about roads.
export default function NearestPanel({ request, guidance, incidentsKnown, onClear, onRetry, children }) {
  if (!request || request.phase === "locating") return null;

  if (request.phase === "need-location") {
    return (
      <div role="region" aria-label="Nearest shelter" aria-live="polite" className={PANEL}>
        <div className="flex items-start gap-3">
          <MapPinOff className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden="true" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-bold">We need your location</p>
            <p className="mt-1 text-ink-muted">
              {describeLocationError(request.code)} {NEED_LOCATION_MESSAGE}
            </p>
            <button type="button" onClick={onRetry} className={`${SMALL_BUTTON} mt-3`}>
              <RefreshCw className="size-3.5" aria-hidden="true" />
              Try again
            </button>
          </div>
          <CloseButton onClear={onClear} />
        </div>
      </div>
    );
  }

  if (!guidance) {
    return (
      <div role="region" aria-label="Nearest shelter" aria-live="polite" className={PANEL}>
        <div className="flex items-start gap-3">
          <Compass className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden="true" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-bold">No shelter is open with free spaces right now</p>
            <p className="mt-1 text-ink-muted">Every listed shelter is full or closed. Check again in a little while.</p>
          </div>
          <CloseButton onClear={onClear} />
        </div>
      </div>
    );
  }

  const { shelter, distanceKm: km, direction, warning, source } = guidance;
  const free = shelter.capacity - shelter.occupied;
  const where = direction ? `${formatDistance(km)} ${compassWord(direction)} (${direction}) of ${source === "saved" ? "your saved location" : "you"}` : "You are already here";

  return (
    <div role="region" aria-label="Nearest shelter" aria-live="polite" className={PANEL}>
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-safe/15 text-safe">
          <Compass className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Nearest open shelter</p>
          <h2 className="mt-0.5 font-display text-base leading-tight font-bold break-words">{shelter.name}</h2>
          <p className="mt-1.5 text-sm font-semibold">
            {where}
            <span className="font-normal text-ink-muted"> · {free.toLocaleString("en-US")} {free === 1 ? "space" : "spaces"} free</span>
          </p>
          <p className="mt-1 text-xs text-ink-muted">{STRAIGHT_LINE_NOTE}</p>
          {warning && (
            <p className="mt-2.5">
              <NearIncidentBadge warning={warning} withDistance />
            </p>
          )}
          {!incidentsKnown && <p className="mt-2 text-xs text-warn">Couldn&apos;t check for nearby incidents.</p>}
          {source === "saved" && (
            <p className="mt-2 text-xs text-ink-muted">Measured from the location saved on your account, because your device location wasn&apos;t available.</p>
          )}
          {children && <div className="mt-3 flex flex-wrap items-center gap-2">{children}</div>}
        </div>
        <CloseButton onClear={onClear} />
      </div>
    </div>
  );
}

export { SMALL_BUTTON as nearestPanelButtonClass };
