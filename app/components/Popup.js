"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { MAX_POPUPS, POPUP_MS, dismissPopup, getPopupsVersion, isDismissed, popupRank, registerPopup, subscribePopups } from "@/lib/popups";

// The one pop-up notice. Every notice in the app (toasts, "You're offline", "Saved data",
// map and route notices) is drawn with this, so they all behave the same:
//   - gone by itself after 10 s (the timer pauses while the pointer is over it or focus is in it)
//   - a close button (at least 44 x 44 to tap, "Dismiss") that removes it at once
//   - at most 3 on screen together (the rest wait their turn)
//   - once dismissed it stays dismissed until `signature` changes (see lib/popups.js)
//   - aria-live, and no motion for people who asked for none
// `compact` is for notices that must stay slim (the route notices on the map): the close button
// keeps its 44px tap area but hangs out over the padding.
// `id` names the notice (one at a time per id); `onClose` is called when it is dismissed.
export default function Popup({ id, signature = "", durationMs = POPUP_MS, onClose, role = "status", className = "", children, compact = false, ...rest }) {
  useSyncExternalStore(subscribePopups, getPopupsVersion, getPopupsVersion);
  const gone = isDismissed(id, signature);
  useEffect(() => {
    if (gone) return undefined;
    return registerPopup(id);
  }, [id, gone]);

  const visible = !gone && popupRank(id) >= 0 && popupRank(id) < MAX_POPUPS;
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const remaining = useRef(durationMs);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  const paused = hovered || focused;
  const close = useCallback(() => {
    dismissPopup(id, signature);
    onCloseRef.current?.();
  }, [id, signature]);

  // A new condition (new signature) gets the full time again.
  useEffect(() => {
    remaining.current = durationMs;
  }, [signature, durationMs]);

  useEffect(() => {
    if (!visible || paused) return undefined;
    const startedAt = Date.now();
    const timer = setTimeout(close, remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt));
    };
  }, [visible, paused, close]);

  if (!visible) return null;
  return (
    <div
      role={role}
      data-popup={id}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className={`pointer-events-auto flex max-w-full items-center gap-2.5 rounded-2xl border bg-surface-raised/90 ${compact ? "py-0.5" : "py-2"} pr-1 pl-3.5 text-sm font-semibold text-ink shadow-card-hover backdrop-blur-xl motion-safe:animate-page-in ${className}`}
      {...rest}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">{children}</div>
      <button
        type="button"
        onClick={close}
        aria-label="Dismiss"
        className={`${compact ? "-my-3.5" : "-my-2.5"} flex size-11 shrink-0 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-white/10 hover:text-ink`}
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
