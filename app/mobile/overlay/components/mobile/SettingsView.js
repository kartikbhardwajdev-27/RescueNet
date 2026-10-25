"use client";

import { useSyncExternalStore } from "react";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import Card from "@/components/Card";
import { useToast } from "@/components/SosProvider";
import { getSnapshot, SERVER_SNAPSHOT, subscribe } from "@/lib/native/storage";
import ServerAddressForm from "./ServerAddressForm";

// Settings page of the Android app (the page itself exists only in the app build).
export default function SettingsView() {
  // The gate (MobileGate) has loaded the saved address before this page renders.
  const { serverUrl } = useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);
  const { refresh } = useAuth();
  const showToast = useToast();

  function handleSaved({ signedOut }) {
    // Ask the (new) server who is logged in, without making the person wait for it.
    refresh();
    showToast(signedOut ? "Address saved. You were logged out of the old laptop." : "Address saved");
  }

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <Card lift={false}>
        <h2 className="font-display text-xl font-bold">Laptop address</h2>
        <p className="mt-1 mb-6 text-sm text-ink-muted">
          Where this app finds the RescueNet server. Start it on the laptop with <code className="font-mono whitespace-nowrap">npm run start:lan</code>{" "}
          and type the address it prints. The phone and the laptop must be on the same WiFi, or the phone on the laptop&apos;s
          hotspot.
        </p>
        <ServerAddressForm initialValue={serverUrl} submitLabel="Save" onSaved={handleSaved} />
      </Card>

      <Card lift={false}>
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden="true" />
          <div>
            <h2 className="font-display text-lg font-bold">About the connection</h2>
            <p className="mt-1 text-sm text-ink-muted">
              The laptop has no certificate, so the app talks to it over plain http. Anyone else on that WiFi could read
              or change what travels between the two, including your login. Use your own hotspot or a network you trust.
              Changing the address logs you out, so your login is never sent to a different server.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
