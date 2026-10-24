"use client";

import { useEffect } from "react";

// Registers /sw.js so the app shell is saved on the device (see public/sw.js).
//
// Browsers only offer service workers on a secure origin: https, or localhost.
// On http://<laptop-ip> (a phone on the same WiFi) `serviceWorker` does not
// exist, so this does nothing; the rest of the app, including the offline
// outbox, works there without it. Details in docs/OFFLINE_APP.md.
//
// Only in production builds. In development the file names change on every
// edit, so a worker saving them would serve stale code; instead any worker left
// over from a production run on the same address is removed.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) registration.unregister();
      });
      globalThis.caches?.keys().then((names) => {
        for (const name of names) if (name.startsWith("rescuenet-")) caches.delete(name);
      });
      return;
    }

    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
