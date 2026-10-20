"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import SosModal from "./SosModal";
import Toast from "./Toast";

const SosContext = createContext(null);

export function useSos() {
  const ctx = useContext(SosContext);
  if (!ctx) throw new Error("useSos must be used inside <SosProvider>");
  return ctx;
}

// Owns the SOS modal and toast so the desktop sidebar and the mobile tab bar
// can both open the same one. The modal and toast render here, outside any
// nav element, so no transformed ancestor can affect their fixed positioning.
export default function SosProvider({ children }) {
  const [sosOpen, setSosOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const openSos = useCallback(() => setSosOpen(true), []);
  const closeSos = useCallback(() => setSosOpen(false), []);
  const dismissToast = useCallback(() => setToast(null), []);

  const sendSos = useCallback(() => {
    // No backend yet: just confirm to the user.
    setSosOpen(false);
    setToast({ id: Date.now(), message: "SOS alert sent" });
  }, []);

  const value = useMemo(() => ({ openSos }), [openSos]);

  return (
    <SosContext value={value}>
      {children}
      <SosModal open={sosOpen} onClose={closeSos} onConfirm={sendSos} />
      <Toast toast={toast} onDismiss={dismissToast} />
    </SosContext>
  );
}
