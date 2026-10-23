import Card from "@/components/Card";
import CountUp from "./CountUp";
import Icon from "./Icon";
import { ErrorState, Skeleton } from "./states";
import { toneClasses } from "./tones";

// Only numbers the database actually backs. The captions are fixed text that
// says what each number counts, not data.
const TILES = [
  { key: "activeIncidents", label: "Active incidents", caption: "Not resolved yet", icon: "triangle-alert", tone: "red" },
  { key: "resolvedToday", label: "Resolved today", caption: "Since midnight", icon: "circle-check", tone: "green" },
  { key: "sheltersOpen", label: "Shelters open", caption: "Accepting people", icon: "house-plus", tone: "green" },
  { key: "spacesFree", label: "Spaces free", caption: "Across open shelters", icon: "bed-double", tone: "blue" },
];

export default function StatsRow({ resource, className = "" }) {
  const { data, error, loading, refresh } = resource;

  return (
    <section aria-labelledby="stats-heading" className={className}>
      <h2 id="stats-heading" className="sr-only">
        Statistics
      </h2>
      {!data && !loading ? (
        <Card lift={false}>
          <ErrorState message={error} onRetry={refresh} />
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 @3xl:grid-cols-4">
          {TILES.map((tile) => {
            const tone = toneClasses(tile.tone);
            return (
              <Card key={tile.key} padded={false} className="relative overflow-hidden p-5">
                <span aria-hidden="true" className={`pointer-events-none absolute inset-0 bg-linear-to-br ${tone.tint} to-transparent`} />
                <div className="relative flex items-center gap-2.5">
                  <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${tone.badge}`}>
                    <Icon name={tile.icon} className="size-5" />
                  </span>
                  <p className="text-sm leading-tight font-semibold text-ink-muted">{tile.label}</p>
                </div>
                <div className="relative mt-4 font-display text-5xl leading-none font-bold tracking-tight">
                  {data ? <CountUp value={data[tile.key]} /> : <Skeleton className="h-12 w-20" />}
                </div>
                <p className="relative mt-2 text-xs font-medium text-ink-muted">{tile.caption}</p>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
