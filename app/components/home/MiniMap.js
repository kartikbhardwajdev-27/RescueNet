import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import Card from "@/components/Card";
import { toneClasses } from "./tones";

// Stylised placeholder: no map library yet, and nothing here is interactive.
export default function MiniMap({ markers, legend, className = "" }) {
  return (
    <Card className={`flex flex-col ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold tracking-tight">Live disaster status</h2>
        <Link
          href="/map"
          className="flex shrink-0 items-center gap-1 rounded-xl px-2 py-1 text-sm font-semibold text-brand-to transition-colors hover:bg-white/10"
        >
          Open map
          <ArrowUpRight className="size-4" aria-hidden="true" />
        </Link>
      </div>

      <div
        aria-hidden="true"
        className="map-grid relative mt-4 min-h-64 flex-1 overflow-hidden rounded-2xl border border-line bg-canvas/60"
      >
        <div className="pointer-events-none absolute -top-16 -left-10 size-56 rounded-full bg-brand-from/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-10 -bottom-16 size-56 rounded-full bg-brand-to/15 blur-3xl" />

        {markers.map((marker, i) => (
          <span
            key={marker.id}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
          >
            <span className="relative flex size-3.5">
              <span
                className={`absolute inline-flex size-full rounded-full opacity-75 motion-safe:animate-ping ${toneClasses(marker.tone).dot}`}
                style={{ animationDelay: `${i * 350}ms` }}
              />
              <span className={`relative inline-flex size-3.5 rounded-full ring-2 ring-canvas ${toneClasses(marker.tone).dot}`} />
            </span>
          </span>
        ))}
      </div>

      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-ink-muted">
        {legend.map((item) => (
          <li key={item.label} className="flex items-center gap-2">
            <span className={`size-2.5 rounded-full ${toneClasses(item.tone).dot}`} aria-hidden="true" />
            {item.label}
          </li>
        ))}
      </ul>
    </Card>
  );
}
