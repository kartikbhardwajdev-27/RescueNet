"use client";

import { useEffect, useRef } from "react";
import { CircleAlert, LoaderCircle, Siren } from "lucide-react";

// phase: "idle" | "locating" | "sending". Cancel stays available while locating
// (it aborts the attempt) but not while sending, because a sent alert can't be
// taken back.
export default function SosModal({ open, phase = "idle", error = "", note = "", onClose, onConfirm }) {
  const dialogRef = useRef(null);
  const confirmRef = useRef(null);
  const busy = phase !== "idle";

  // Native <dialog> gives us the focus trap, Esc handling and inert background.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  // After a failed attempt, put focus on "Try again" so it can be retried at once.
  useEffect(() => {
    if (error) confirmRef.current?.focus();
  }, [error]);

  let confirmLabel = error ? "Try again" : "Send";
  if (phase === "locating") confirmLabel = "Locating…";
  if (phase === "sending") confirmLabel = "Sending…";

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="sos-title"
      aria-describedby="sos-description"
      aria-busy={busy}
      onClose={onClose}
      onCancel={(e) => {
        if (phase === "sending") e.preventDefault();
      }}
      onClick={(e) => {
        // Only the backdrop (the dialog element itself) counts as an outside click.
        if (e.target === dialogRef.current && phase !== "sending") onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-card border border-line-strong bg-surface/90 p-0 text-ink shadow-card-hover backdrop-blur-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-sos/20 text-sos-soft">
            <Siren className="size-6" aria-hidden="true" />
          </div>
          <div>
            <h2 id="sos-title" className="font-display text-2xl font-bold tracking-tight">
              Emergency SOS
            </h2>
            <p id="sos-description" className="mt-1.5 text-ink-muted">
              Are you sure you want to send an emergency alert?
            </p>
          </div>
        </div>

        <div aria-live="polite" className={`flex flex-col gap-2 ${busy || note ? "mt-5" : ""}`}>
          {phase === "locating" && (
            <p className="flex items-center gap-2.5 text-sm font-medium">
              <LoaderCircle className="size-4 shrink-0 motion-safe:animate-spin" aria-hidden="true" />
              Getting your location… this can take up to 10 seconds.
            </p>
          )}
          {phase === "sending" && (
            <p className="flex items-center gap-2.5 text-sm font-medium">
              <LoaderCircle className="size-4 shrink-0 motion-safe:animate-spin" aria-hidden="true" />
              Sending your alert…
            </p>
          )}
          {note && <p className="text-sm text-ink-muted">{note}</p>}
        </div>

        {error && (
          <p
            role="alert"
            className="mt-4 flex items-start gap-2.5 rounded-2xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm font-medium"
          >
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden="true" />
            {error}
          </p>
        )}

        <div className="mt-8 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={phase === "sending"}
            className="rounded-2xl border border-line-strong bg-white/5 px-5 py-3 text-sm font-semibold text-ink transition-all duration-150 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60 motion-safe:active:scale-95"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={busy}
            aria-busy={busy}
            className="flex items-center gap-2 rounded-2xl bg-sos px-6 py-3 text-sm font-bold text-white shadow-sos transition-all duration-150 hover:bg-sos-hover disabled:cursor-not-allowed disabled:opacity-80 disabled:hover:bg-sos motion-safe:active:scale-95"
          >
            {busy && <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden="true" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
