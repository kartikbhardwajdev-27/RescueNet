import { CircleAlert, RefreshCw } from "lucide-react";
import Icon from "./Icon";

// Shared loading / empty / error pieces for the dashboard and shelters cards.

export function Skeleton({ className = "" }) {
  return <span aria-hidden="true" className={`block rounded-xl bg-white/10 motion-safe:animate-pulse ${className}`} />;
}

// A few placeholder rows while the first response is on its way.
export function SkeletonRows({ rows = 3, rowClassName = "h-16" }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={rowClassName} />
      ))}
    </div>
  );
}

export function EmptyState({ icon = "inbox", title, hint }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line-strong px-4 py-8 text-center">
      <span className="flex size-11 items-center justify-center rounded-2xl bg-white/5 text-ink-muted">
        <Icon name={icon} className="size-5" />
      </span>
      <p className="font-semibold">{title}</p>
      {hint && <p className="max-w-xs text-sm text-ink-muted">{hint}</p>}
    </div>
  );
}

// Amber, not red: red is reserved for emergencies.
export function ErrorState({ message = "Couldn't reach the server", onRetry }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-warn/30 bg-warn/10 px-4 py-7 text-center">
      <CircleAlert className="size-6 text-warn" aria-hidden="true" />
      <div>
        <p className="font-semibold">{"Couldn't load this right now"}</p>
        <p className="mt-0.5 text-sm text-ink-muted">{message}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="flex items-center gap-2 rounded-xl border border-line-strong bg-white/5 px-4 py-2 text-sm font-semibold transition-all duration-150 hover:bg-white/10 motion-safe:active:scale-95"
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          Try again
        </button>
      )}
    </div>
  );
}
