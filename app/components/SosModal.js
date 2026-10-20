"use client";

import { useEffect, useRef } from "react";
import { Siren } from "lucide-react";

export default function SosModal({ open, onClose, onConfirm }) {
  const dialogRef = useRef(null);

  // Native <dialog> gives us the focus trap, Esc handling and inert background.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="sos-title"
      aria-describedby="sos-description"
      onClose={onClose}
      onClick={(e) => {
        // Only the backdrop (the dialog element itself) counts as an outside click.
        if (e.target === dialogRef.current) onClose();
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

        <div className="mt-8 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-line-strong bg-white/5 px-5 py-3 text-sm font-semibold text-ink transition-all duration-150 hover:bg-white/10 motion-safe:active:scale-95"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-2xl bg-sos px-6 py-3 text-sm font-bold text-white shadow-sos transition-all duration-150 hover:bg-sos-hover motion-safe:active:scale-95"
          >
            Send
          </button>
        </div>
      </div>
    </dialog>
  );
}
