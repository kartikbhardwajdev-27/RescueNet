"use client";

import { useCallback, useEffect, useState } from "react";

const DEFAULT_INTERVAL_MS = 30_000;

// Loads a resource and keeps it fresh: refetches every `intervalMs` while the
// tab is visible, and straight away when the tab becomes visible again.
//
// `fetcher` is one of the helpers in lib/api.js: ({ signal }) -> { ok, data } or
// { ok: false, kind, message }. It must be a stable reference.
//
// Returns { data, error, errorKind, loading, fetchedAt, savedAt, refresh }.
//   loading     true until the first response (success or failure)
//   errorKind   what sort of failure it was ("network", "not_found", "unauthorized",
//               ... see lib/api.js), so a screen can tell "gone" from "offline"
//   error       the last failure's message; cleared by the next success. A failed
//               refresh keeps `data`, so the screen keeps showing the last good copy.
//   fetchedAt   when `data` arrived (ms), for relative times that don't read the clock during render
//   savedAt     set only in the Android app, when `data` is a copy saved on the device
//               because the server could not be reached: the time (ms) it was saved.
//               null for live data (always, on the website).
export default function usePolledResource(fetcher, { intervalMs = DEFAULT_INTERVAL_MS } = {}) {
  const [state, setState] = useState({ data: null, error: null, errorKind: null, loading: true, fetchedAt: null, savedAt: null });

  const apply = useCallback((result) => {
    if (result.kind === "aborted") return;
    setState((prev) =>
      result.ok
        ? { data: result.data, error: null, errorKind: null, loading: false, fetchedAt: Date.now(), savedAt: result.savedAt ?? null }
        : { ...prev, error: result.message, errorKind: result.kind, loading: false },
    );
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const fetchNow = () => {
      fetcher({ signal: controller.signal }).then((result) => {
        if (!controller.signal.aborted) apply(result);
      });
    };
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") fetchNow();
    };

    fetchNow();
    const timer = setInterval(refreshIfVisible, intervalMs);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [fetcher, intervalMs, apply]);

  // Manual retry. With nothing to show yet, go back to the loading state.
  const refresh = useCallback(() => {
    setState((prev) => (prev.data ? prev : { ...prev, loading: true, error: null, errorKind: null }));
    return fetcher().then(apply);
  }, [fetcher, apply]);

  return { ...state, refresh };
}
