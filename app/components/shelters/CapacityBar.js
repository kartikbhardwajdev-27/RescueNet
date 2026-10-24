import { toneClasses } from "@/components/home/tones";

// "62 / 150 occupied", "88 spaces free" and a bar. Shared by the shelter cards
// and the map popup. The bar turns amber when nearly full, grey when closed.
export default function CapacityBar({ capacity, occupied, status }) {
  const free = Math.max(0, capacity - occupied);
  const percent = capacity > 0 ? Math.min(100, Math.round((occupied / capacity) * 100)) : 0;
  const fillTone = status === "closed" ? "muted" : status === "full" || percent >= 90 ? "amber" : "green";

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
        <span className="font-semibold">
          {occupied.toLocaleString("en-US")} / {capacity.toLocaleString("en-US")} occupied
        </span>
        <span className="text-ink-muted">
          {status === "closed" ? "Closed" : `${free.toLocaleString("en-US")} ${free === 1 ? "space" : "spaces"} free`}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-valuenow={occupied}
        aria-label={`${occupied} of ${capacity} places occupied`}
        className="h-2.5 overflow-hidden rounded-full bg-white/10"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none ${toneClasses(fillTone).dot}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
