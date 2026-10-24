"use client";

import { useEffect, useState } from "react";
import { Inbox, RefreshCw, Siren, Trash2 } from "lucide-react";
import Card from "@/components/Card";
import { incidentTypeMeta } from "@/components/incidentMeta";
import useOutbox from "@/components/useOutbox";
import { incidentReference, withoutEmergencyHint } from "@/lib/api";
import { removeItem, retryItem } from "@/lib/outbox";
import { formatRelativeTime } from "@/lib/time";
import OutboxStatusBadge from "./OutboxStatusBadge";

const MAX_SHOWN = 10;

function describe(item) {
  if (item.kind === "sos") return { title: "SOS alert", detail: "Emergency alert with your location", Icon: Siren, isSos: true };
  const { label, icon: Icon } = incidentTypeMeta(item.payload.type);
  const severity = item.payload.severity;
  return { title: `${label} report`, detail: `${severity ? `${severity[0].toUpperCase()}${severity.slice(1)} severity · ` : ""}${item.payload.description}`, Icon };
}

const buttonClass =
  "flex items-center gap-1.5 rounded-xl border border-line-strong bg-white/5 px-3 py-1.5 text-xs font-bold transition-all duration-150 hover:bg-white/10 motion-safe:active:scale-95";

function Row({ item, now }) {
  const { title, detail, Icon, isSos } = describe(item);
  const sentAgo = item.status === "sent" && item.result ? ` · Reference ${incidentReference(item.result.id)}` : "";

  return (
    <li className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${isSos ? "bg-sos/20 text-sos-soft" : "bg-info/15 text-info"}`}
      >
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">{title}</p>
          <OutboxStatusBadge status={item.status} />
        </div>
        <p className="mt-0.5 line-clamp-2 text-sm break-words text-ink-muted">{detail}</p>
        <p className="mt-1 text-xs text-ink-muted">
          Saved {formatRelativeTime(new Date(item.createdAt).toISOString(), now)}
          {item.attempts > 0 && item.status !== "sent" ? ` · ${item.attempts} ${item.attempts === 1 ? "try" : "tries"}` : ""}
          {sentAgo}
        </p>
        {item.lastError && (item.status === "queued" || item.status === "failed") && (
          <p className="mt-1 text-xs text-warn">Last try: {withoutEmergencyHint(item.lastError)}</p>
        )}
        {item.status !== "sending" && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {(item.status === "queued" || item.status === "failed") && (
              <button type="button" onClick={() => retryItem(item.id)} className={buttonClass}>
                <RefreshCw className="size-3.5" aria-hidden="true" />
                {item.status === "queued" ? "Send now" : "Try again"}
              </button>
            )}
            <button type="button" onClick={() => removeItem(item.id)} className={buttonClass}>
              <Trash2 className="size-3.5" aria-hidden="true" />
              Remove
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

// "Saved on this device": reports and SOS alerts made on this device, including
// the ones still waiting for the connection. Lives on the account page.
export default function OutboxList() {
  const { items, available, ready } = useOutbox();
  // The clock is read in an effect, not while rendering, and ticks so "Saved 4
  // min ago" does not go stale on a page that stays open.
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 30_000);
    return () => clearInterval(timer);
  }, []);

  const shown = items.slice(0, MAX_SHOWN);

  return (
    <Card lift={false} className="mt-6 max-w-2xl" aria-labelledby="outbox-heading">
      <h3 id="outbox-heading" className="font-display text-lg font-bold">
        Saved on this device
      </h3>
      <p className="mt-1 text-sm text-ink-muted">
        Reports and SOS alerts made here. If the connection drops, they wait here and are sent when it returns.
      </p>

      <div className="mt-5">
        {available === false ? (
          <p className="text-sm text-warn">This browser can&apos;t keep saved reports (private browsing?), so nothing waits here.</p>
        ) : !ready ? (
          <p className="text-sm text-ink-muted">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="flex items-center gap-2.5 text-sm text-ink-muted">
            <Inbox className="size-5 shrink-0" aria-hidden="true" />
            Nothing waiting. Anything you send while offline will show up here until it is delivered.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {shown.map((item) => (
              <Row key={item.id} item={item} now={now} />
            ))}
          </ul>
        )}
        {items.length > MAX_SHOWN && <p className="mt-4 text-xs text-ink-muted">Showing the newest {MAX_SHOWN} of {items.length}.</p>}
      </div>
    </Card>
  );
}
