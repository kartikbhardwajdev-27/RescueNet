import { CircleAlert, History, HousePlus, Info, LoaderCircle, LocateFixed, MapPinOff, Navigation, RefreshCw, TriangleAlert } from "lucide-react";
import { ErrorState } from "@/components/home/states";
import { formatSavedTime } from "@/components/SavedDataBanner";
import { toneClasses } from "@/components/home/tones";
import { LEGEND_ITEMS } from "./mapMeta";

// The glass panels laid over the map. They are siblings of the map element, so
// each wrapper that spans the map is pointer-events-none and only the panels
// themselves catch taps. Everything is reachable from the bottom edge on a phone.

const GLASS = "border border-line bg-glass shadow-card backdrop-blur-xl";

const FILTERS = [
  { key: "incidents", label: "Incidents", icon: TriangleAlert },
  { key: "shelters", label: "Shelters", icon: HousePlus },
];

function FilterChips({ filters, counts, onToggle }) {
  return (
    <div role="group" aria-label="Show on map" className="flex flex-wrap gap-2">
      {FILTERS.map(({ key, label, icon: Icon }) => {
        const selected = filters[key];
        return (
          <button
            key={key}
            type="button"
            aria-pressed={selected}
            onClick={() => onToggle(key)}
            className={`flex min-h-10 items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-all duration-150 motion-safe:active:scale-95 ${
              selected ? "bg-brand-gradient text-on-brand shadow-brand" : "border border-line-strong bg-white/5 text-ink-muted hover:bg-white/10 hover:text-ink"
            }`}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
            {counts[key] !== null && <span className="font-semibold opacity-80">{counts[key]}</span>}
          </button>
        );
      })}
    </div>
  );
}

function Swatch({ tone, shape }) {
  const dot = toneClasses(tone).dot;
  if (shape === "square") return <span className={`size-3 rounded-[4px] ${dot}`} aria-hidden="true" />;
  if (shape === "you") return <span className={`size-3 rounded-full ring-2 ring-white ${dot}`} aria-hidden="true" />;
  return <span className={`size-3 rounded-full ${dot}`} aria-hidden="true" />;
}

function Legend() {
  return (
    <ul aria-label="Legend" className="flex flex-wrap gap-x-3.5 gap-y-1 px-1 text-[11px] font-medium text-ink-muted">
      {LEGEND_ITEMS.map(({ id, label, tone, shape }) => (
        <li key={id} className="flex items-center gap-1.5">
          <Swatch tone={tone} shape={shape} />
          {label}
        </li>
      ))}
    </ul>
  );
}

function LocateButton({ onClick, locating }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={locating}
      className={`flex h-12 shrink-0 items-center gap-2 rounded-full px-5 text-sm font-bold text-ink transition-all duration-150 hover:bg-white/10 disabled:opacity-80 motion-safe:active:scale-95 ${GLASS}`}
    >
      {locating ? (
        <LoaderCircle className="size-5 motion-safe:animate-spin" aria-hidden="true" />
      ) : (
        <LocateFixed className="size-5 text-brand-to" aria-hidden="true" />
      )}
      {locating ? "Locating…" : "My location"}
    </button>
  );
}

function NearestButton({ onClick, busy, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      className={`flex h-12 shrink-0 items-center gap-2 rounded-full px-5 text-sm font-bold text-ink transition-all duration-150 hover:bg-white/10 disabled:opacity-70 motion-safe:active:scale-95 ${GLASS}`}
    >
      {busy ? (
        <LoaderCircle className="size-5 motion-safe:animate-spin" aria-hidden="true" />
      ) : (
        <Navigation className="size-5 text-safe" aria-hidden="true" />
      )}
      {busy ? "Finding…" : "Navigate to nearest shelter"}
    </button>
  );
}

// Bottom edge: legend + filters, and the two location buttons above them on a
// phone (beside them from md up). `bottom-9` keeps clear of the attribution.
export function BottomControls({ filters, counts, onToggle, onLocate, locating, onNearest, findingNearest, nearestEnabled }) {
  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-9 z-10 flex flex-col-reverse items-end gap-2 md:inset-x-4 md:flex-row md:justify-between">
      <div className={`pointer-events-auto flex w-full flex-col gap-2.5 rounded-2xl p-2.5 md:w-auto md:max-w-md ${GLASS}`}>
        <FilterChips filters={filters} counts={counts} onToggle={onToggle} />
        <Legend />
      </div>
      <div className="pointer-events-auto flex flex-col items-end gap-2 md:flex-row-reverse md:items-center">
        <LocateButton onClick={onLocate} locating={locating} />
        <NearestButton onClick={onNearest} busy={findingNearest} disabled={!nearestEnabled} />
      </div>
    </div>
  );
}

const NOTICE_TONES = {
  info: "border-line-strong text-ink",
  warn: "border-warn/40 text-ink",
};

function Notice({ icon: Icon, tone = "info", children, action }) {
  return (
    <div
      role="status"
      className={`pointer-events-auto flex max-w-full items-center gap-2.5 rounded-2xl border bg-surface-raised/90 py-2 pr-2 pl-3.5 text-sm font-semibold shadow-card-hover backdrop-blur-xl ${NOTICE_TONES[tone]}`}
    >
      <Icon className={`size-4 shrink-0 ${tone === "warn" ? "text-warn" : "text-brand-to"}`} aria-hidden="true" />
      <span className="min-w-0 py-0.5">{children}</span>
      {action ?? <span className="w-1.5" aria-hidden="true" />}
    </div>
  );
}

// Top edge: what is going on with the data and the map, one line each.
//   loading          the first responses are still on their way
//   problem          { text, onRetry } for a failed load or refresh
//   baseMapMissing   the .pmtiles file isn't there (see docs/OFFLINE_MAP.md)
//   outsideCoverage  the view is outside the offline tiles
//   empty            loaded fine, but nothing to plot
//   savedAt          (Android app) the markers are a copy saved on the phone, from this time (ms)
export function TopNotices({ loading, problem, baseMapMissing, outsideCoverage, empty, savedAt = null, children }) {
  return (
    // pr-12 keeps the panels clear of the zoom buttons at the top right on a phone.
    <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-col items-center gap-2 pr-12 md:inset-x-16 md:pr-0">
      {loading && (
        <Notice icon={LoaderCircle} tone="info">
          <span className="motion-safe:animate-pulse">Loading incidents and shelters…</span>
        </Notice>
      )}
      {baseMapMissing && (
        <Notice icon={CircleAlert} tone="warn">
          Offline map tiles are missing. Generate them with the command in docs/OFFLINE_MAP.md.
        </Notice>
      )}
      {problem && (
        <Notice
          icon={CircleAlert}
          tone="warn"
          action={
            <button
              type="button"
              onClick={problem.onRetry}
              className="flex shrink-0 items-center gap-1.5 rounded-xl border border-line-strong bg-white/5 px-3 py-1.5 text-xs font-bold transition-colors hover:bg-white/10 motion-safe:active:scale-95"
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
              Retry
            </button>
          }
        >
          {problem.text}
        </Notice>
      )}
      {savedAt !== null && (
        <Notice icon={History} tone="warn">
          Saved data from {formatSavedTime(savedAt)}, not live
        </Notice>
      )}
      {outsideCoverage && (
        <Notice icon={MapPinOff} tone="info">
          The offline map covers Chandigarh, Mohali and Panchkula only.
        </Notice>
      )}
      {empty && (
        <Notice icon={Info} tone="info">
          Nothing to show yet. Active incidents and shelters will appear here as they are added.
        </Notice>
      )}
      {children}
    </div>
  );
}

// Nothing loaded at all (both requests failed): a card in the middle with a retry.
export function LoadFailed({ message, onRetry }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center p-6">
      <div className="pointer-events-auto w-full max-w-sm rounded-2xl bg-surface shadow-card-hover">
        <ErrorState message={message} onRetry={onRetry} />
      </div>
    </div>
  );
}

// The map itself cannot start (no WebGL).
export function MapUnavailable({ message }) {
  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-surface p-6">
      <div role="alert" className="flex max-w-sm flex-col items-center gap-2 text-center">
        <CircleAlert className="size-6 text-warn" aria-hidden="true" />
        <p className="font-semibold">{"The map couldn't start"}</p>
        <p className="text-sm text-ink-muted">{message}</p>
      </div>
    </div>
  );
}
