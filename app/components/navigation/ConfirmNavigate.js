"use client";

import { useEffect, useRef } from "react";
import { TriangleAlert } from "lucide-react";
import { ACTIVE_INCIDENT_NOTE } from "@/lib/routing/navigation";

// "Navigate to an active incident?" Shown before a route to a high or critical active
// incident starts. Cancel is the default (it has the focus), Escape cancels.
export default function ConfirmNavigate({ incident, onCancel, onContinue }) {
  const cancelRef = useRef(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div className="rn-safe-x absolute inset-0 z-40 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-nav-title" aria-describedby="confirm-nav-text" className="w-full max-w-sm rounded-2xl border border-line-strong bg-surface-raised p-4 shadow-card-hover">
        <div className="flex items-start gap-3">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden="true" />
          <div className="min-w-0">
            <h2 id="confirm-nav-title" className="font-display text-base font-bold">
              Navigate to an active incident?
            </h2>
            <p id="confirm-nav-text" className="mt-1.5 text-sm text-ink-muted">
              This is a {incident.severity} severity incident. {ACTIVE_INCIDENT_NOTE} Directions stop at the nearest road, not at the incident.
            </p>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button ref={cancelRef} type="button" onClick={onCancel} className="flex min-h-11 flex-1 items-center justify-center rounded-xl border border-line-strong bg-white/5 px-4 text-sm font-bold transition-colors hover:bg-white/10">
            Cancel
          </button>
          <button type="button" onClick={onContinue} className="flex min-h-11 flex-1 items-center justify-center rounded-xl bg-brand-gradient px-4 text-sm font-bold text-on-brand shadow-brand hover:brightness-110">
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
