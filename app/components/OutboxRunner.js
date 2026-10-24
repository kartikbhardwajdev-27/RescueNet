"use client";

import { useEffect } from "react";
import { startOutbox } from "@/lib/outbox";

// Starts the offline outbox for the whole app: it sends saved reports and SOS
// alerts when the server can be reached, and watches whether it can be.
// Renders nothing.
export default function OutboxRunner() {
  useEffect(() => startOutbox(), []);
  return null;
}
