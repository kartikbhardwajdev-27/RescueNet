"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { incidentReference } from "@/lib/api";
import { getCurrentLocation } from "@/lib/geo";
import { onOutboxEvent, submitToOutbox } from "@/lib/outbox";
import { isPending } from "@/lib/outboxRules";
import { useAuth } from "./AuthProvider";
import SosModal from "./SosModal";
import Toast from "./Toast";
import useOutbox from "./useOutbox";

const SosContext = createContext(null);

function useSosContext() {
  const ctx = useContext(SosContext);
  if (!ctx) throw new Error("useSos / useToast must be used inside <SosProvider>");
  return ctx;
}

export function useSos() {
  return useSosContext();
}

// Shows a message in the shared toast:
//   const showToast = useToast();
//   showToast("Saved");
//   showToast("Something failed", { kind: "error", duration: 7000 });
export function useToast() {
  return useSosContext().showToast;
}

const NO_LOCATION_MESSAGE = "Couldn't get your location. Enable location and try again";

// Owns the SOS modal, the SOS flow and the toast, so the desktop sidebar, the
// mobile tab bar and the Home hero all open the same modal and any component can
// show a toast. They render here, outside any nav element, so no transformed
// ancestor can affect their fixed positioning.
//
// SOS flow: locate (10 s limit) -> save in the outbox and send (lib/outbox.js).
//   sent    -> toast with a reference
//   queued  -> the server could not be reached; the modal stays open and says
//              the alert is saved and will send by itself
//   failed  -> the error is shown in the modal
// phase: "idle" | "locating" | "sending".
export default function SosProvider({ children }) {
  const { user } = useAuth();
  const [sosOpen, setSosOpen] = useState(false);
  const [phase, setPhaseState] = useState("idle");
  const [sosError, setSosError] = useState("");
  const [sosNote, setSosNote] = useState("");
  const [toast, setToast] = useState(null);
  const outbox = useOutbox();
  // An SOS that is saved but not yet delivered. Only one at a time: pressing SOS
  // again would only queue a second alert for the same emergency.
  const waitingSos = outbox.items.find((item) => item.kind === "sos" && isPending(item)) ?? null;

  // Refs mirror state the async flow needs to read after an await.
  const openRef = useRef(false);
  const phaseRef = useRef("idle");
  const runRef = useRef({ id: 0, controller: null });

  const setPhase = useCallback((next) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  const showToast = useCallback((message, { kind = "success", duration } = {}) => {
    setToast({ id: Date.now(), message, kind, duration });
  }, []);

  const openSos = useCallback(() => {
    openRef.current = true;
    setSosError("");
    setSosNote("");
    setSosOpen(true);
  }, []);

  // Closing while still locating cancels the attempt. Closing while the request
  // is already in flight can't unsend it, so the result arrives as a toast.
  const closeSos = useCallback(() => {
    openRef.current = false;
    if (phaseRef.current === "locating") {
      runRef.current.id += 1;
      runRef.current.controller?.abort();
      setPhase("idle");
    }
    setSosOpen(false);
    setSosError("");
    setSosNote("");
  }, [setPhase]);

  const confirmSos = useCallback(async () => {
    if (phaseRef.current !== "idle") return;

    const run = runRef.current;
    const runId = ++run.id;
    const controller = new AbortController();
    run.controller = controller;
    const cancelled = () => run.id !== runId;

    setSosError("");
    setSosNote("");
    setPhase("locating");

    let location = null;
    try {
      location = await getCurrentLocation({ signal: controller.signal });
    } catch (err) {
      if (err.code === "aborted") return;
    }
    if (cancelled()) return;

    let usedSavedLocation = false;
    if (!location) {
      const saved = user?.location?.coordinates;
      if (!saved) {
        setPhase("idle");
        openRef.current = false;
        setSosOpen(false);
        showToast(NO_LOCATION_MESSAGE, { kind: "error", duration: 8000 });
        return;
      }
      location = { lng: saved[0], lat: saved[1] };
      usedSavedLocation = true;
      setSosNote("Couldn't get your live location. Using your saved location.");
    }

    setPhase("sending");
    const result = await submitToOutbox({ kind: "sos", payload: { location } });

    setPhase("idle");
    if (result.status === "sent") {
      openRef.current = false;
      setSosOpen(false);
      setSosError("");
      setSosNote("");
      const source = usedSavedLocation ? " from your saved location" : "";
      showToast(`SOS sent${source}. Reference: ${incidentReference(result.id)}`, { kind: "sos", duration: 9000 });
      return;
    }
    if (result.status === "queued") {
      // Saved. An open modal switches to its "queued" state by itself (it reads
      // the outbox); if it was closed meanwhile, say so in a toast.
      setSosError("");
      if (!openRef.current) {
        showToast("SOS saved. It will send when the connection returns.", { kind: "sos", duration: 9000 });
      }
      return;
    }
    // The toast sits behind an open modal, so show the error inside it instead.
    if (openRef.current) setSosError(result.message);
    else showToast(result.message, { kind: "error", duration: 9000 });
  }, [user, setPhase, showToast]);

  // Saved items that finish later, while nobody is watching them. There is one
  // toast, so results that arrive within a moment of each other (the SOS and a
  // report that were waiting together) are put in one message. Otherwise the
  // later one would wipe the earlier, and the SOS confirmation must not be lost.
  const resultsRef = useRef({ timer: null, events: [] });
  useEffect(() => {
    const batch = resultsRef.current;

    const announce = () => {
      batch.timer = null;
      const events = batch.events.splice(0);
      const sent = events.filter((event) => event.type === "sent").map((event) => event.item);
      const failed = events.filter((event) => event.type === "failed").map((event) => event.item);

      const sentSos = sent.filter((item) => item.kind === "sos");
      const sentReports = sent.filter((item) => item.kind === "report");
      const parts = [];
      if (sentSos.length) parts.push(`SOS sent. Reference: ${sentSos.map((item) => incidentReference(item.result.id)).join(", ")}.`);
      if (sentReports.length === 1) parts.push(`Saved report sent. Reference: ${incidentReference(sentReports[0].result.id)}.`);
      else if (sentReports.length > 1) parts.push(`${sentReports.length} saved reports sent.`);
      for (const item of failed) parts.unshift(`A saved ${item.kind === "sos" ? "SOS" : "report"} couldn't be sent: ${item.lastError}.`);

      if (parts.length === 0) return;
      const kind = failed.length ? "error" : sentSos.length ? "sos" : "success";
      showToast(parts.join(" "), { kind, duration: 9000 });
    };

    const stop = onOutboxEvent((event) => {
      // A queued SOS that was waiting in the open modal is done: close it now.
      if (event.type === "sent" && event.item.kind === "sos" && openRef.current) {
        openRef.current = false;
        setSosOpen(false);
      }
      batch.events.push(event);
      batch.timer ??= setTimeout(announce, 400);
    });
    return () => {
      stop();
      clearTimeout(batch.timer);
      batch.timer = null;
      batch.events.length = 0;
    };
  }, [showToast]);

  const value = useMemo(() => ({ openSos, showToast }), [openSos, showToast]);

  return (
    <SosContext value={value}>
      {children}
      <SosModal
        open={sosOpen}
        phase={phase}
        error={sosError}
        note={sosNote}
        queued={waitingSos}
        onClose={closeSos}
        onConfirm={confirmSos}
      />
      <Toast toast={toast} onDismiss={dismissToast} />
    </SosContext>
  );
}
