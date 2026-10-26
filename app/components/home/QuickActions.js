import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import Card from "@/components/Card";
import Icon from "./Icon";
import { toneClasses } from "./tones";

// Navigation shortcuts. Fixed content, not data.
const ACTIONS = [
  { id: "report", title: "Report Incident", description: "Flag a hazard or emergency", href: "/report", icon: "file-plus", tone: "amber" },
  { id: "shelter", title: "Find Shelter", description: "Open shelters near you", href: "/shelters", icon: "house-plus", tone: "green" },
  // Opens the map and starts road directions to the nearest open shelter (a straight line
  // instead when there is no road data or the person is outside the mapped area).
  { id: "nearest", title: "Nearest Shelter", description: "Road directions to the closest open shelter", href: "/map?nearest=1", icon: "compass", tone: "green" },
  { id: "numbers", title: "Emergency Numbers", description: "Call 112, 100, 101 or 108", href: "/resources", icon: "life-buoy", tone: "blue" },
];

export default function QuickActions({ className = "" }) {
  return (
    <section aria-labelledby="quick-actions-heading" className={className}>
      <h2 id="quick-actions-heading" className="sr-only">
        Quick actions
      </h2>
      <div className="grid h-full grid-cols-2 grid-rows-2 gap-4">
        {ACTIONS.map((action) => (
          <Card
            key={action.id}
            as={Link}
            href={action.href}
            padded={false}
            className="group flex flex-col justify-between gap-4 p-4 motion-safe:active:scale-[0.98]"
          >
            <div className="flex items-start justify-between">
              <span className={`flex size-10 items-center justify-center rounded-xl ${toneClasses(action.tone).badge}`}>
                <Icon name={action.icon} className="size-5" />
              </span>
              <ArrowUpRight
                className="size-5 text-ink-muted transition-transform duration-150 group-hover:text-ink motion-safe:group-hover:translate-x-0.5 motion-safe:group-hover:-translate-y-0.5"
                aria-hidden="true"
              />
            </div>
            <div>
              <h3 className="font-display text-base leading-tight font-bold">{action.title}</h3>
              {/* min-h-8 reserves two lines so titles line up across tiles. */}
              <p className="mt-1 min-h-8 text-xs text-ink-muted">{action.description}</p>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
