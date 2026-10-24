"use client";

import { Info, Send, ServerOff, WifiOff } from "lucide-react";
import useOutbox from "./useOutbox";
import { isPending } from "@/lib/outboxRules";

// A small status pill, shown only when something is worth knowing:
//
//   offline    the server cannot be reached         amber
//   degraded   the server is up, its database is not  amber
//   no internet, server fine (e.g. WiFi off while RescueNet runs on this
//              laptop)                                blue, reassuring
//   waiting    saved items are on their way           blue
//
// "Offline" means the *server* is unreachable, not that the internet is. With
// WiFi off the app still works whenever its own server does.
// `text` is the full sentence (md and up, where there is room); `short` fits on
// one line on a phone, where a taller pill would cover the page heading.
function describe({ serverState, browserOnline }, waiting) {
  const saved = waiting > 0 ? ` ${waiting} waiting to send.` : "";
  const count = waiting > 0 ? `${waiting} waiting to send` : null;
  if (serverState === "offline") {
    return {
      tone: "warn",
      Icon: WifiOff,
      text: `You're offline. Reports and SOS are saved on this device and sent when the connection returns.${saved}`,
      short: count ? `Offline · ${count}` : "Offline · reports and SOS are saved",
    };
  }
  if (serverState === "degraded") {
    return {
      tone: "warn",
      Icon: ServerOff,
      text: `The server can't reach its database right now. Reports and SOS are saved on this device and sent when it's back.${saved}`,
      short: count ? `Server unavailable · ${count}` : "Server unavailable · reports are saved",
    };
  }
  if (serverState === "online" && !browserOnline) {
    return {
      tone: "info",
      Icon: Info,
      text: "No internet. RescueNet runs on its own server, so everything here still works.",
      short: "No internet · RescueNet still works",
    };
  }
  if (serverState === "online" && waiting > 0) {
    const text = `Sending ${waiting} saved ${waiting === 1 ? "item" : "items"}…`;
    return { tone: "info", Icon: Send, text, short: text };
  }
  return null;
}

const TONES = {
  warn: { box: "border-warn/40", icon: "text-warn" },
  info: { box: "border-info/30", icon: "text-info" },
};

export default function ConnectivityBanner() {
  const outbox = useOutbox();
  const waiting = outbox.items.filter(isPending).length;
  const shown = describe(outbox, waiting);
  if (!shown) return null;

  const { Icon, text, short, tone } = shown;
  return (
    <div className="pointer-events-none fixed inset-x-3 top-[4.5rem] z-50 flex justify-center md:inset-x-auto md:top-3 md:right-6 md:justify-end">
      <p
        role="status"
        className={`pointer-events-auto flex max-w-xl items-start gap-2.5 rounded-2xl border bg-surface-raised/90 px-3.5 py-2 text-sm font-semibold text-ink shadow-card-hover backdrop-blur-xl max-md:items-center ${TONES[tone].box}`}
      >
        <Icon className={`mt-0.5 size-4 shrink-0 ${TONES[tone].icon}`} aria-hidden="true" />
        <span className="md:hidden">{short}</span>
        <span className="hidden md:inline">{text}</span>
      </p>
    </div>
  );
}
