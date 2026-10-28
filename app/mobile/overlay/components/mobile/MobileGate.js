"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Laptop, LoaderCircle } from "lucide-react";
import Card from "@/components/Card";
import Logo from "@/components/Logo";
import { askLocationPermissionIfNew } from "@/lib/devicePosition";
import { DEFAULT_SERVER_URL } from "@/lib/native/defaultServer";
import ServerAddressForm from "./ServerAddressForm";
import { getSnapshot, loadSettings, markSetupDone, SERVER_SNAPSHOT, subscribe } from "@/lib/native/storage";

// Android app only: this is what PlatformGate is in the app build.
//
// Holds the app back until two things are known: what was saved on this phone
// (read once from Preferences), and whether the first-run screen has been
// answered. Nothing below it runs before that, so no screen or background task
// can call the API before the app knows where the laptop is.

function FullScreen({ children }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-4 sm:p-6">
      <Logo />
      {children}
    </div>
  );
}

function FirstRun() {
  return (
    <FullScreen>
      <Card lift={false} className="w-full max-w-md">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-white/5 text-info">
          <Laptop className="size-6" aria-hidden="true" />
        </span>
        <h1 className="mt-4 font-display text-2xl font-bold tracking-tight">Connect to the laptop</h1>
        <p className="mt-2 mb-6 text-sm text-ink-muted">
          {DEFAULT_SERVER_URL
            ? "This app was set up to use the address below. Check it and continue, or change it. The map and the guides work on this phone without any connection."
            : "RescueNet's server runs on a laptop. Put this phone on the same WiFi (or the laptop's hotspot) and type the laptop's address below. No internet is needed. The map and the guides work on this phone without it."}
        </p>
        <ServerAddressForm initialValue={DEFAULT_SERVER_URL} submitLabel="Save and continue">
          <button
            type="button"
            onClick={markSetupDone}
            className="rounded-2xl px-4 py-2.5 text-sm font-semibold text-ink-muted transition-colors hover:bg-white/10 hover:text-ink"
          >
            Skip for now
          </button>
        </ServerAddressForm>
      </Card>
    </FullScreen>
  );
}

export default function MobileGate({ children }) {
  const { loaded, setupDone } = useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);

  useEffect(() => {
    loadSettings();
  }, []);

  // Once the first-run screen is out of the way, ask for location if Android has
  // never been asked, so the permission dialog is not what an SOS has to wait for.
  useEffect(() => {
    if (loaded && setupDone) askLocationPermissionIfNew();
  }, [loaded, setupDone]);
  if (!loaded) {
    return (
      <FullScreen>
        <LoaderCircle className="size-6 text-ink-muted motion-safe:animate-spin" aria-label="Loading" />
      </FullScreen>
    );
  }
  if (!setupDone) return <FirstRun />;
  return children;
}
