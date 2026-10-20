"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
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

// Shows a message in the shared toast: const showToast = useToast(); showToast("Saved").
export function useToast() {
  return useSosContext().showToast;
}

// Owns the SOS modal and the toast so the desktop sidebar and the mobile tab bar
// can both open the same modal, and any component can show a toast. They render
// here, outside any nav element, so no transformed ancestor can affect their
// fixed positioning.
export default function SosProvider({ children }) {
  const [sosOpen, setSosOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const openSos = useCallback(() => setSosOpen(true), []);
  const closeSos = useCallback(() => setSosOpen(false), []);
  const dismissToast = useCallback(() => setToast(null), []);

  const showToast = useCallback((message, kind = "success") => {
    setToast({ id: Date.now(), message, kind });
  }, []);

  const sendSos = useCallback(() => {
    // No backend yet: just confirm to the user.
    setSosOpen(false);
    showToast("SOS alert sent", "sos");
  }, [showToast]);

  const value = useMemo(() => ({ openSos, showToast }), [openSos, showToast]);

  return (
    <SosContext value={value}>
      {children}
      <SosModal open={sosOpen} onClose={closeSos} onConfirm={sendSos} />
      <Toast toast={toast} onDismiss={dismissToast} />
    </SosContext>
  );
}
