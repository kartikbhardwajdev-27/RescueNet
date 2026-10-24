import Card from "@/components/Card";
import { MAP_CARD_SIZE } from "./mapLayout";

// Shown while the map code loads (it is client-only and loaded on demand).
export default function MapSkeleton() {
  return (
    <Card padded={false} lift={false} aria-busy="true" className={`grid place-items-center overflow-hidden ${MAP_CARD_SIZE}`}>
      <p className="text-sm font-semibold text-ink-muted motion-safe:animate-pulse">Loading map…</p>
    </Card>
  );
}
