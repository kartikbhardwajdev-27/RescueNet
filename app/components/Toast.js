"use client";

import { CircleAlert, CircleCheck, Send } from "lucide-react";
import Popup from "./Popup";

// `toasts` is a list of { id, message, kind }, oldest first (the provider keeps at most MAX_TOASTS).
// Each is a Popup (components/Popup.js): gone on its own after 10 s, the timer pauses on hover
// or focus, the close button removes it at once, and no more than 3 pop-ups show together.
// Errors are amber (warning): red is reserved for SOS / emergencies.
export const MAX_TOASTS = 3;

const KINDS = {
  success: { Icon: CircleCheck, tone: "bg-info/20 text-info" },
  sos: { Icon: Send, tone: "bg-info/20 text-info" },
  info: { Icon: CircleCheck, tone: "bg-info/20 text-info" },
  error: { Icon: CircleAlert, tone: "bg-warn/20 text-warn" },
};

function ToastItem({ toast, onDismiss }) {
  const { Icon, tone } = KINDS[toast.kind] ?? KINDS.success;
  return (
    <Popup
      id={`toast-${toast.id}`}
      onClose={() => onDismiss(toast.id)}
      data-toast
      data-toast-kind={toast.kind}
      className="max-w-md border-line-strong"
    >
      <span className={`flex size-8 shrink-0 items-center justify-center rounded-xl ${tone}`}>
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 break-words">{toast.message}</span>
    </Popup>
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
