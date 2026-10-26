import { Clock, HousePlus, MapPin, Navigation, Phone, X } from "lucide-react";
import DemoTag from "@/components/DemoTag";
import { toneClasses } from "@/components/home/tones";
import SosBadge from "@/components/incidents/SosBadge";
import { incidentKindMeta } from "@/components/incidentMeta";
import CapacityBar from "@/components/shelters/CapacityBar";
import NearIncidentBadge from "@/components/shelters/NearIncidentBadge";
import { SHELTER_STATUS_META } from "@/components/shelters/statusMeta";
import { formatRelativeTime, incidentTime } from "@/lib/time";
import { incidentStatusMeta, severityMeta } from "./mapMeta";

function Pill({ tone, children }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${toneClasses(tone).badge}`}>{children}</span>;
}

function Header({ icon, tone, title, pills, onClose }) {
  return (
    <div className="flex items-start gap-3">
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${toneClasses(tone).badge}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-base leading-tight font-bold">{title}</h2>
        <div className="mt-1.5 flex flex-wrap gap-1.5">{pills}</div>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close details"
        className="-mt-1 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-white/10 hover:text-ink"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function IncidentDetails({ incident, now, onClose }) {
  const { label: typeLabel, icon: TypeIcon, isSos } = incidentKindMeta(incident);
  const severity = severityMeta(incident.severity);
  const status = incidentStatusMeta(incident.status);

  return (
    <>
      <Header
        icon={<TypeIcon className="size-5" aria-hidden="true" />}
        tone={severity.tone}
        title={
          isSos ? (
            <span className="flex items-center gap-2">
              <SosBadge />
              Alert
            </span>
          ) : (
            typeLabel
          )
        }
        onClose={onClose}
        pills={
          <>
            <Pill tone={severity.tone}>{severity.label} severity</Pill>
            <Pill tone={status.tone}>{status.label}</Pill>
            {incident.seeded && <DemoTag />}
          </>
        }
      />
      <p className="mt-3 flex items-start gap-2 text-sm">
        <MapPin className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden="true" />
        <span>{incident.address || "No address given"}</span>
      </p>
      {incident.description && <p className="mt-2 line-clamp-3 text-sm text-ink-muted">{incident.description}</p>}
      <p className="mt-3 flex items-center gap-2 text-xs font-medium text-ink-muted">
        <Clock className="size-4 shrink-0" aria-hidden="true" />
        <time dateTime={incidentTime(incident)} title={new Date(incidentTime(incident)).toLocaleString()}>
          Reported {formatRelativeTime(incidentTime(incident), now)}
        </time>
      </p>
    </>
  );
}

function ShelterDetails({ shelter, warning, onNavigate, onClose }) {
  const status = SHELTER_STATUS_META[shelter.status] ?? SHELTER_STATUS_META.open;

  return (
    <>
      <Header
        icon={<HousePlus className="size-5" aria-hidden="true" />}
        tone="green"
        title={shelter.name}
        onClose={onClose}
        pills={
          <>
            <Pill tone={status.tone}>{status.label}</Pill>
            {shelter.seeded && (
              <span className="rounded-full border border-line-strong px-2.5 py-0.5 text-xs font-semibold text-ink-muted">Demo</span>
            )}
          </>
        }
      />
      <p className="mt-3 flex items-start gap-2 text-sm">
        <MapPin className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden="true" />
        <span>{shelter.address}</span>
      </p>
      <div className="mt-3">
        <CapacityBar capacity={shelter.capacity} occupied={shelter.occupied} status={shelter.status} />
      </div>
      {warning && (
        <p className="mt-3">
          <NearIncidentBadge warning={warning} withDistance />
        </p>
      )}
      {shelter.contactPhone && (
        <a
          href={`tel:${shelter.contactPhone.replace(/[^\d+]/g, "")}`}
          className="mt-3 flex items-center gap-2 text-sm text-ink-muted hover:text-ink"
        >
          <Phone className="size-4 shrink-0" aria-hidden="true" />
          {shelter.contactPhone}
        </a>
      )}
      {onNavigate && (
        <button
          type="button"
          onClick={onNavigate}
          className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-gradient px-4 text-sm font-bold text-on-brand shadow-brand transition-all duration-150 hover:brightness-110 motion-safe:active:scale-95"
        >
          <Navigation className="size-4" aria-hidden="true" />
          Navigate
        </button>
      )}
    </>
  );
}

// The card inside the map popup. `now` is when the data arrived, so the
// "reported X ago" text is stable between refreshes (see lib/time.js).
export default function PopupCard({ kind, record, warning, now, onNavigate, onClose }) {
  return (
    <div className="w-[min(20rem,calc(100vw-3rem))] p-4">
      {kind === "incident" ? (
        <IncidentDetails incident={record} now={now} onClose={onClose} />
      ) : (
        <ShelterDetails shelter={record} warning={warning} onNavigate={onNavigate} onClose={onClose} />
      )}
    </div>
  );
}
