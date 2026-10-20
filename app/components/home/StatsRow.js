import { TrendingUp } from "lucide-react";
import Card from "@/components/Card";
import CountUp from "./CountUp";
import Icon from "./Icon";
import { toneClasses } from "./tones";

export default function StatsRow({ stats, className = "" }) {
  return (
    <section aria-labelledby="stats-heading" className={className}>
      <h2 id="stats-heading" className="sr-only">
        Statistics
      </h2>
      <div className="grid grid-cols-2 gap-4 @3xl:grid-cols-4">
        {stats.map((stat) => {
          const tone = toneClasses(stat.tone);
          return (
            <Card key={stat.id} padded={false} className="relative overflow-hidden p-5">
              <span aria-hidden="true" className={`pointer-events-none absolute inset-0 bg-linear-to-br ${tone.tint} to-transparent`} />
              <div className="relative flex items-center gap-2.5">
                <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${tone.badge}`}>
                  <Icon name={stat.icon} className="size-5" />
                </span>
                <p className="text-sm leading-tight font-semibold text-ink-muted">{stat.label}</p>
              </div>
              <p className="relative mt-4 font-display text-5xl leading-none font-bold tracking-tight">
                <CountUp value={stat.value} />
              </p>
              <p className="relative mt-2 flex items-center gap-1.5 text-xs font-medium text-ink-muted">
                {stat.trend === "up" && <TrendingUp className="size-3.5" aria-hidden="true" />}
                {stat.detail}
              </p>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
