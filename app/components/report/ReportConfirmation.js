"use client";

import { RefreshCw, Trash2, X } from "lucide-react";
import Card from "@/components/Card";
import OutboxStatusBadge from "@/components/outbox/OutboxStatusBadge";
import useOutbox from "@/components/useOutbox";
import { incidentReference } from "@/lib/api";
import { removeItem, retryItem } from "@/lib/outbox";

// Shown above the report form after a report was saved but not delivered yet.
// It follows the outbox item, so "Queued" turns into "Sent" by itself when the
// connection returns.
const COPY = {
  queued: { title: "Report queued", body: "Saved on this device. It will be sent automatically when the connection returns." },
  sending: { title: "Sending your report", body: "Saved on this device and on its way to the server." },
  failed: { title: "Report not sent", body: "The server did not accept this report." },
};

const buttonClass =
  "flex items-center gap-2 rounded-xl border border-line-strong bg-white/5 px-3.5 py-2 text-sm font-semibold transition-all duration-150 hover:bg-white/10 motion-safe:active:scale-95";

export default function ReportConfirmation({ itemId, onDismiss }) {
  const { items } = useOutbox();
  const item = items.find((candidate) => candidate.id === itemId);
  if (!item) return null;

  const copy =
    item.status === "sent"
      ? { title: "Report sent", body: `Reference: ${incidentReference(item.result.id)}. Responders can see it now.` }
      : COPY[item.status];

  return (
    <Card lift={false} className="mb-5 max-w-3xl border-line-strong" role="status" aria-live="polite">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="font-display text-lg font-bold">{copy.title}</h2>
            <OutboxStatusBadge status={item.status} />
          </div>
          <p className="mt-1.5 text-sm text-ink-muted">{copy.body}</p>
          {item.lastError && item.status !== "sent" && <p className="mt-1 text-xs text-ink-muted">Last try: {item.lastError}</p>}

          {(item.status === "queued" || item.status === "failed") && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => retryItem(item.id)} className={buttonClass}>
                <RefreshCw className="size-4" aria-hidden="true" />
                {item.status === "queued" ? "Send now" : "Try again"}
              </button>
              {item.status === "failed" && (
                <button type="button" onClick={() => removeItem(item.id)} className={buttonClass}>
                  <Trash2 className="size-4" aria-hidden="true" />
                  Remove
                </button>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-mt-1 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-white/10 hover:text-ink"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </Card>
  );
}
