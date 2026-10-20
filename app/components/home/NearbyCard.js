import Link from "next/link";
import Card from "@/components/Card";
import Icon from "./Icon";
import { toneClasses } from "./tones";

export default function NearbyCard({ items, className = "" }) {
  return (
    <Card className={className}>
      <h2 className="font-display text-xl font-bold tracking-tight">Nearby</h2>
      <ul className="mt-4 flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 rounded-2xl border border-line bg-white/5 p-3">
            <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${toneClasses(item.tone).badge}`}>
              <Icon name={item.icon} className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{item.name}</p>
              <p className="text-xs text-ink-muted">{item.distanceKm.toFixed(1)} km away</p>
            </div>
            <Link
              href={item.href}
              aria-label={`${item.action} for ${item.name}`}
              className="shrink-0 rounded-xl border border-line-strong bg-white/5 px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-white/10 motion-safe:active:scale-95"
            >
              {item.action}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
