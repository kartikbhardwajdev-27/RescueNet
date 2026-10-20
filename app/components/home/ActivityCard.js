import Card from "@/components/Card";
import { toneClasses } from "./tones";

function formatAge(minutes) {
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} h ago`;
}

export default function ActivityCard({ items, className = "" }) {
  return (
    <Card className={className}>
      <h2 className="font-display text-xl font-bold tracking-tight">Recent activity</h2>
      {/* The vertical line is one pseudo-element behind the dots. */}
      <ol className="relative mt-5 flex flex-col gap-5 before:absolute before:top-2 before:bottom-2 before:left-[7px] before:w-px before:bg-line-strong">
        {items.map((item) => (
          <li key={item.id} className="relative pl-8">
            <span
              aria-hidden="true"
              className={`absolute top-1 left-0 size-3.5 rounded-full ring-4 ring-surface ${toneClasses(item.tone).dot}`}
            />
            <p className="text-sm font-semibold">{item.title}</p>
            <p className="text-xs text-ink-muted">{item.detail}</p>
            <p className="mt-0.5 text-xs font-medium text-ink-muted">{formatAge(item.minutesAgo)}</p>
          </li>
        ))}
      </ol>
    </Card>
  );
}
