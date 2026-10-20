"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { incidentReference, sendSos } from "@/lib/api";
import { getCurrentLocation } from "@/lib/geo";
import { useAuth } from "./AuthProvider";
import SosModal from "./SosModal";
import Toast from "./Toast";

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
// SOS flow: locate (10 s limit) -> POST /api/sos -> toast with a reference.
// phase: "idle" | "locating" | "sending".
export default function SosProvider({ children }) {
  const { user } = useAuth();
  const [sosOpen, setSosOpen] = useState(false);
  const [phase, setPhaseState] = useState("idle");
  const [sosError, setSosError] = useState("");
  const [sosNote, setSosNote] = useState("");
  const [toast, setToast] = useState(null);

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
    const result = await sendSos(location);

    setPhase("idle");
    if (result.ok) {
      openRef.current = false;
      setSosOpen(false);
      setSosError("");
      setSosNote("");
      const source = usedSavedLocation ? " from your saved location" : "";
      showToast(`SOS sent${source}. Reference: ${incidentReference(result.id)}`, { kind: "sos", duration: 9000 });
      return;
    }
    // The toast sits behind an open modal, so show the error inside it instead.
    if (openRef.current) setSosError(result.message);
    else showToast(result.message, { kind: "error", duration: 9000 });
  }, [user, setPhase, showToast]);

  const value = useMemo(() => ({ openSos, showToast }), [openSos, showToast]);

  return (
    <SosContext value={value}>
      {children}
      <SosModal
        open={sosOpen}
        phase={phase}
        error={sosError}
        note={sosNote}
        onClose={closeSos}
        onConfirm={confirmSos}
      />
      <Toast toast={toast} onDismiss={dismissToast} />
    </SosContext>
  );
}
