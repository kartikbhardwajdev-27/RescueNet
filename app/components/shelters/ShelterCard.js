import Link from "next/link";
import { Compass, Map as MapIcon, MapPin, Navigation, Pencil, Phone } from "lucide-react";
import Card from "@/components/Card";
import { toneClasses } from "@/components/home/tones";
import { formatDistance } from "@/lib/geo";
import { mapHref, navigateHref } from "@/lib/mapFocus";
import CapacityBar from "./CapacityBar";
import NearIncidentBadge from "./NearIncidentBadge";
import { SHELTER_STATUS_META } from "./statusMeta";

// One shelter: status, how full it is, how far away and in which direction, a
// warning when an active high or critical incident is within 2 km, and (for the
// organization that added it) an edit button.
//   direction  "N" ... "NW" from the person to the shelter, or null
//   warning    { count, nearestKm } from shelterWarnings(), or undefined
//   isNearest  this is the shelter "Nearest shelter" picked
export default function ShelterCard({ shelter, distanceKm, direction = null, warning, isNearest = false, canEdit, onEdit }) {
  const { name, address, capacity, occupied, status, contactPhone, seeded } = shelter;
  const meta = SHELTER_STATUS_META[status] ?? SHELTER_STATUS_META.open;

  return (
    <Card
      as="article"
      padded={false}
      lift
      className={`flex flex-col gap-4 p-5 ${isNearest ? "ring-2 ring-safe/70" : ""}`}
      data-shelter-id={shelter._id}
      data-nearest={isNearest ? "true" : undefined}
    >
      {isNearest && (
        <p className="-mb-1 flex items-center gap-2 text-xs font-bold tracking-wide text-safe uppercase">
          <Compass className="size-4" aria-hidden="true" />
          Nearest open shelter
        </p>
      )}
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

      <CapacityBar capacity={capacity} occupied={occupied} status={status} />

      {warning && (
        <p>
          <NearIncidentBadge warning={warning} withDistance />
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-muted">
        {distanceKm !== null && (
          <span className="flex items-center gap-1.5">
            <MapPin className="size-4" aria-hidden="true" />
            {formatDistance(distanceKm)} away{direction ? ` · ${direction}` : ""}
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
          href={navigateHref(shelter._id)}
          className="flex items-center gap-2 rounded-xl bg-brand-gradient px-3.5 py-2 text-sm font-bold text-on-brand shadow-brand transition-all duration-150 hover:brightness-110 motion-safe:active:scale-95"
        >
          <Navigation className="size-4" aria-hidden="true" />
          Navigate
        </Link>
        <Link
          href={mapHref("shelter", shelter._id)}
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
