import { CircleAlert, ShieldCheck } from "lucide-react";
import { Skeleton } from "./states";

// The top-of-page banner. `resource` is the /api/stats resource from usePolledResource.
//   active incidents  -> red (emergency is the one place red belongs)
//   none              -> calm green
//   no data yet       -> skeleton, or an amber "couldn't load" with a retry
export default function StatusStrip({ resource, className = "" }) {
  const { data, error, loading, refresh } = resource;
  const shape = "rounded-3xl px-5 py-3 sm:rounded-full";

  if (!data) {
    if (loading) {
      return (
        <div className={className}>
          <Skeleton className="h-12 rounded-3xl sm:rounded-full" />
        </div>
      );
    }
    return (
      <div role="alert" className={`flex flex-wrap items-center gap-3 border border-warn/40 bg-warn/10 ${shape} ${className}`}>
        <CircleAlert className="size-5 shrink-0 text-warn" aria-hidden="true" />
        <p className="text-sm font-medium">{`Couldn't load the latest status. ${error ?? ""}`}</p>
        <button
          type="button"
          onClick={refresh}
          className="ml-auto rounded-xl border border-line-strong bg-white/5 px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-white/10"
        >
          Try again
        </button>
      </div>
    );
  }

  const count = data.activeIncidents;
  if (count === 0) {
    return (
      <div className={`flex items-center gap-3 border border-safe/30 bg-safe/10 ${shape} ${className}`}>
        <ShieldCheck className="size-5 shrink-0 text-safe" aria-hidden="true" />
        <p className="text-sm font-medium">No active emergencies reported nearby</p>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 border border-sos/40 bg-sos/10 ${shape} ${className}`}>
      <span className="relative flex size-3 shrink-0" aria-hidden="true">
        <span className="absolute inline-flex size-full rounded-full bg-sos opacity-75 motion-safe:animate-ping" />
        <span className="relative inline-flex size-3 rounded-full bg-sos" />
      </span>
      <p className="text-sm font-medium text-ink">
        <strong className="font-display font-bold tracking-wide text-sos-soft">ACTIVE EMERGENCY:</strong>{" "}
        {count.toLocaleString("en-US")} {count === 1 ? "incident" : "incidents"} reported
      </p>
    </div>
  );
}
