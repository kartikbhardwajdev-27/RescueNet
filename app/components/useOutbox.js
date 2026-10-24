"use client";

import { useSyncExternalStore } from "react";
import { getOutboxSnapshot, getServerOutboxSnapshot, subscribeOutbox } from "@/lib/outbox";

// The offline outbox's current state: { items, available, ready, serverState,
// browserOnline }. See lib/outbox.js. Re-renders when anything in it changes.
export default function useOutbox() {
  return useSyncExternalStore(subscribeOutbox, getOutboxSnapshot, getServerOutboxSnapshot);
}
