import { Activity, Flame, HeartPulse, Waves } from "lucide-react";
import Card from "@/components/Card";

const ICONS = { waves: Waves, flame: Flame, activity: Activity, "heart-pulse": HeartPulse };

// One short guide: a title, what it is for, and numbered steps. No JavaScript,
// so it works whatever the browser or connection.
export default function GuideCard({ guide }) {
  const Icon = ICONS[guide.icon] ?? Activity;
  const headingId = `guide-${guide.id}`;

  return (
    <Card as="article" lift={false} aria-labelledby={headingId} className="flex flex-col">
      <div className="flex items-start gap-3.5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-info/15 text-info">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 id={headingId} className="font-display text-xl font-bold tracking-tight">
            {guide.title}
          </h3>
          <p className="mt-0.5 text-sm text-ink-muted">{guide.summary}</p>
        </div>
      </div>
      <ol className="mt-5 flex flex-col gap-3">
        {guide.steps.map((step, index) => (
          <li key={step} className="flex gap-3 text-sm leading-relaxed">
            <span
              aria-hidden="true"
              className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-ink-muted"
            >
              {index + 1}
            </span>
            <span className="min-w-0">{step}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
