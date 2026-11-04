"use client";

import { useEffect, useRef, useState } from "react";
import { CircleAlert, CircleCheck, Send, X } from "lucide-react";

// `toasts` is a list of { id, message, kind }, oldest first (the provider keeps at most MAX_TOASTS).
// Each one goes away on its own: 4 s for success and info, 7 s for errors. The timer pauses
// while the pointer is over the toast or focus is inside it, and the close button removes it
// at once. Errors are amber (warning): red is reserved for SOS / emergencies.
export const MAX_TOASTS = 3;
export const AUTO_DISMISS_MS = { success: 4000, sos: 4000, info: 4000, error: 7000 };

const KINDS = {
  success: { Icon: CircleCheck, tone: "bg-info/20 text-info" },
  sos: { Icon: Send, tone: "bg-info/20 text-info" },
  info: { Icon: CircleCheck, tone: "bg-info/20 text-info" },
  error: { Icon: CircleAlert, tone: "bg-warn/20 text-warn" },
};

function ToastItem({ toast, onDismiss }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const remaining = useRef(AUTO_DISMISS_MS[toast.kind] ?? AUTO_DISMISS_MS.success);
  const paused = hovered || focused;

  useEffect(() => {
    if (paused) return undefined;
    const startedAt = Date.now();
    const timer = setTimeout(() => onDismiss(toast.id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt));
    };
  }, [paused, toast.id, onDismiss]);

  const { Icon, tone } = KINDS[toast.kind] ?? KINDS.success;

  return (
    <div
      data-toast
      data-toast-kind={toast.kind}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className="pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl border border-line-strong bg-surface-raised/90 py-3 pr-2 pl-4 text-sm font-semibold text-ink shadow-card-hover backdrop-blur-xl motion-safe:animate-page-in"
    >
      <span className={`flex size-8 shrink-0 items-center justify-center rounded-xl ${tone}`}>
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 break-words">{toast.message}</span>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="-my-2 flex size-11 shrink-0 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-white/10 hover:text-ink"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export default function Toast({ toasts, onDismiss }) {
  // The live region stays mounted so screen readers announce new messages.
  // Sits above the mobile tab bar (bottom-28) and in the corner on desktop.
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-28 z-60 flex flex-col items-center gap-2 md:inset-x-auto md:right-6 md:bottom-6 md:items-end"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
