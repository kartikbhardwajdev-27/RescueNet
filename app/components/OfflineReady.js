"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { CircleCheck, LoaderCircle, RotateCw, TriangleAlert } from "lucide-react";
import { formatSavedTime } from "@/components/SavedDataBanner";
import { getOfflineState, prepareOffline, startOfflineManager, subscribeOfflineState } from "@/lib/offline/manager";

// "Preparing offline use…" while the pages, data, map and road graph are being
// saved on this device, then "Offline ready ✓ (saved 2:41 pm)". What it says is
// worked out from what is really on the device (lib/offline/manager.js).
//
// Website only: the Android app carries all of this inside the APK, and is built
// with mobile/overlay/components/OfflineReady.js (nothing) in its place.
//
// `hideAfterMs`: the floating pill on phones steps aside this long after it says
// "ready" so it does not sit over the page; the sidebar one stays.
const serverState = () => ({ phase: "idle", parts: {}, savedAt: null, mapProgress: null, problem: null });

const PART_LABELS = { pages: "pages", data: "data", map: "map", graph: "road data" };

export default function OfflineReady({ className = "", hideAfterMs = 0 }) {
  const state = useSyncExternalStore(subscribeOfflineState, getOfflineState, serverState);
  useEffect(() => {
    startOfflineManager();
  }, []);
  const [hiddenAt, setHiddenAt] = useState(false);
  const isReady = state.phase === "ready";
  useEffect(() => {
    if (!hideAfterMs || !isReady) return;
    const timer = setTimeout(() => setHiddenAt(true), hideAfterMs);
    return () => {
      clearTimeout(timer);
      setHiddenAt(false);
    };
  }, [hideAfterMs, isReady]);

  if (state.phase === "idle" || state.phase === "unsupported" || (isReady && hiddenAt)) return null;

  const missing = Object.entries(state.parts).filter(([, done]) => !done).map(([key]) => PART_LABELS[key]);
  const base = "flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-semibold leading-snug";

  if (state.phase === "ready") {
    return (
      <p role="status" data-offline-state="ready" className={`${base} border-safe/40 bg-safe/10 text-ink ${className}`}>
        <CircleCheck className="size-4 shrink-0 text-safe" aria-hidden="true" />
        <span>
          Offline ready ✓{state.savedAt ? <span className="font-medium text-ink-muted"> (saved {formatSavedTime(state.savedAt)})</span> : null}
        </span>
      </p>
    );
  }

  if (state.phase === "incomplete") {
    return (
      <div role="status" data-offline-state="incomplete" className={`${base} border-warn/40 bg-warn/10 text-ink ${className}`}>
        <TriangleAlert className="size-4 shrink-0 text-warn" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          Not ready for offline use{state.problem ? `: ${state.problem}` : ""}
        </span>
        <button
          type="button"
          onClick={() => prepareOffline()}
          className="flex min-h-9 shrink-0 items-center gap-1 rounded-xl px-2 text-ink underline-offset-2 hover:underline"
        >
          <RotateCw className="size-3.5" aria-hidden="true" />
          Retry
        </button>
      </div>
    );
  }

  const progress = typeof state.mapProgress === "number" ? ` map ${Math.round(state.mapProgress * 100)}%` : "";
  return (
    <p role="status" data-offline-state="preparing" className={`${base} border-info/30 bg-info/10 text-ink ${className}`}>
      <LoaderCircle className="size-4 shrink-0 animate-spin text-info motion-reduce:animate-none" aria-hidden="true" />
      <span>
        Preparing offline use…{progress}
        {missing.length > 0 && !progress ? <span className="font-medium text-ink-muted"> ({missing.join(", ")})</span> : null}
      </span>
    </p>
  );
}
