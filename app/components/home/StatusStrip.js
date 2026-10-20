// Red is allowed here: this strip is the emergency signal.
export default function StatusStrip({ status, className = "" }) {
  if (!status.active) return null;

  const { incidentCount, areaLabel } = status;

  return (
    <div
      className={`flex items-center gap-3 rounded-3xl border border-sos/40 bg-sos/10 px-5 py-3 sm:rounded-full ${className}`}
    >
      <span className="relative flex size-3 shrink-0" aria-hidden="true">
        <span className="absolute inline-flex size-full rounded-full bg-sos opacity-75 motion-safe:animate-ping" />
        <span className="relative inline-flex size-3 rounded-full bg-sos" />
      </span>
      <p className="text-sm font-medium text-ink">
        <strong className="font-display font-bold tracking-wide text-sos-soft">ACTIVE EMERGENCY:</strong>{" "}
        {incidentCount} {incidentCount === 1 ? "incident" : "incidents"} reported in {areaLabel}
      </p>
    </div>
  );
}
