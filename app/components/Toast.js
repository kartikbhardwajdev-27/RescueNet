"use client";

import { useEffect } from "react";
import { Send } from "lucide-react";

// `toast` is null or { id, message }. A new id restarts the dismiss timer, so
// showing the same message twice still resets it.
export default function Toast({ toast, onDismiss, duration = 4000 }) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [toast, onDismiss, duration]);

  // The live region stays mounted so screen readers announce the new message.
  // Sits above the mobile tab bar (bottom-28) and in the corner on desktop.
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-28 z-60 flex justify-center md:inset-x-auto md:right-6 md:bottom-6 md:justify-end"
    >
      {toast && (
        <div
          key={toast.id}
          className="flex animate-page-in items-center gap-3 rounded-2xl border border-line-strong bg-surface-raised/90 px-4 py-3 text-sm font-semibold text-ink shadow-card-hover backdrop-blur-xl"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-info/20 text-info">
            <Send className="size-4" aria-hidden="true" />
          </span>
          {toast.message}
        </div>
      )}
    </div>
  );
}
