import Link from "next/link";
import { Map as MapIcon, MapPin, Pencil, Phone } from "lucide-react";
import Card from "@/components/Card";
import { toneClasses } from "@/components/home/tones";
import { formatDistance } from "@/lib/geo";
import { SHELTER_STATUS_META } from "./statusMeta";

// One shelter: status, how full it is, how far away, and (for the organization
// that added it) an edit button.
export default function ShelterCard({ shelter, distanceKm, canEdit, onEdit }) {
  const { name, address, capacity, occupied, status, contactPhone, seeded } = shelter;
  const meta = SHELTER_STATUS_META[status] ?? SHELTER_STATUS_META.open;
  const free = Math.max(0, capacity - occupied);
  const percent = capacity > 0 ? Math.min(100, Math.round((occupied / capacity) * 100)) : 0;
  // The bar turns amber when nearly full, and grey when the shelter is closed.
  const fillTone = status === "closed" ? "muted" : status === "full" || percent >= 90 ? "amber" : "green";

  return (
    <Card as="article" padded={false} lift className="flex flex-col gap-4 p-5" data-shelter-id={shelter._id}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-lg leading-snug font-bold">{name}</h3>
          <p className="mt-1 text-sm text-ink-muted">{address}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${toneClasses(meta.tone).badge}`}>{meta.label}</span>
          {seeded && (
            <span className="rounded-full border border-line-strong px-2.5 py-0.5 text-[11px] font-semibold text-ink-muted">Demo</span>
          )}
        </div>
      </div>

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

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-muted">
        {distanceKm !== null && (
          <span className="flex items-center gap-1.5">
            <MapPin className="size-4" aria-hidden="true" />
            {formatDistance(distanceKm)} away
          </span>
        )}
        {contactPhone && (
          <a href={`tel:${contactPhone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-1.5 hover:text-ink">
            <Phone className="size-4" aria-hidden="true" />
            {contactPhone}
          </a>
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        <Link
          href="/map"
          className="flex items-center gap-2 rounded-xl border border-line-strong bg-white/5 px-3.5 py-2 text-sm font-semibold transition-all duration-150 hover:bg-white/10 motion-safe:active:scale-95"
        >
          <MapIcon className="size-4" aria-hidden="true" />
          View on map
        </Link>
        {canEdit && (
          <button
            type="button"
            onClick={() => onEdit(shelter)}
            className="flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold text-brand-to transition-colors hover:bg-white/10"
          >
            <Pencil className="size-4" aria-hidden="true" />
            Edit
          </button>
        )}
      </div>
    </Card>
  );
}
