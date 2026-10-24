"use client";

import { useMemo } from "react";
import { Lightbulb } from "lucide-react";
import { INCIDENT_SEVERITIES } from "@/lib/incidentRules";
import { scoreDescription } from "@/lib/triage";
import { describeReasons } from "@/components/incidents/priorityText";
import { severityMeta } from "@/components/map/mapMeta";

// "Suggested priority" chip under the description. It reads the words as the
// person types (plain keyword rules in lib/triage.js, so it works offline) and
// offers a higher severity when the words sound more serious than the level
// chosen. It never changes anything by itself, and never suggests going down.
export default function SuggestedPriority({ description, severity, onApply }) {
  const result = useMemo(() => scoreDescription(description), [description]);
  const { suggestedSeverity, reasons } = result;

  const rank = (level) => INCIDENT_SEVERITIES.indexOf(level);
  const higher = suggestedSeverity && rank(suggestedSeverity) > rank(severity);
  const matches = suggestedSeverity && suggestedSeverity === severity;
  const { label } = suggestedSeverity ? severityMeta(suggestedSeverity) : {};

  return (
    // Always on the page so a screen reader announces it when it appears.
    <div role="status" aria-live="polite" className={higher || matches ? "mt-3" : undefined}>
      {higher && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-info/30 bg-info/10 px-3.5 py-2.5 text-sm">
          <Lightbulb className="size-4 shrink-0 text-info" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-ink">
            <span className="font-bold">Suggested priority: {label}</span>
            <span className="text-ink-muted">, because it {describeReasons(reasons)}</span>
          </p>
          <button
            type="button"
            onClick={() => onApply(suggestedSeverity)}
            className="rounded-xl bg-info/20 px-3.5 py-1.5 text-sm font-bold text-info transition-all duration-150 hover:bg-info/30 motion-safe:active:scale-95"
          >
            Apply
          </button>
        </div>
      )}
      {matches && (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Lightbulb className="size-4 shrink-0 text-info" aria-hidden="true" />
          Suggested priority: {label}, which matches your choice.
        </p>
      )}
    </div>
  );
}
