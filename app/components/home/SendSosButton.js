"use client";

import { Siren } from "lucide-react";
import { useSos } from "@/components/SosProvider";

export default function SendSosButton() {
  const { openSos } = useSos();

  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={openSos}
      className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-sos px-6 py-3.5 font-display text-base font-bold text-white shadow-sos transition-colors duration-150 hover:bg-sos-hover motion-safe:active:scale-95 sm:w-auto"
    >
      <Siren className="size-5" aria-hidden="true" />
      Send SOS
    </button>
  );
}
