"use client";

import { useEffect, useSyncExternalStore } from "react";
import { History, Info, Send, ServerOff, WifiOff } from "lucide-react";
import OfflineReady from "./OfflineReady";
import Popup from "./Popup";
import { formatSavedTime } from "./SavedDataBanner";
import { getPopupsVersion, oldestReportedSavedAt, resetPopup, subscribePopups } from "@/lib/popups";
import useOutbox from "./useOutbox";
import { isPending } from "@/lib/outboxRules";

// The stack of status notices at the top of the screen, and the small pills that stay.
//
// Each notice below is a Popup (components/Popup.js): it goes away by itself after 10 s or when
// dismissed, and stays away until its condition changes. What it was telling you does not go away
// with it: a small pill ("Offline", "Saved data") stays for as long as the condition holds.
//
// Notices:
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
  warn: { box: "border-warn/40", icon: "text-warn", pill: "border-warn/40 bg-warn/10" },
  info: { box: "border-info/30", icon: "text-info", pill: "border-info/30 bg-info/10" },
};

const PILL = {
  offline: "Offline",
  degraded: "Server unavailable",
};

function Pill({ tone, Icon, children, ...rest }) {
  return (
    <span
      className={`pointer-events-none flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] leading-none font-bold text-ink backdrop-blur-xl ${TONES[tone].pill}`}
      {...rest}
    >
      <Icon className={`size-3 ${TONES[tone].icon}`} aria-hidden="true" />
      {children}
    </span>
  );
}

export default function ConnectivityBanner() {
  const outbox = useOutbox();
  useSyncExternalStore(subscribePopups, getPopupsVersion, getPopupsVersion);
  const waiting = outbox.items.filter(isPending).length;
  const shown = describe(outbox, waiting);
  const savedAt = oldestReportedSavedAt();

  // What the connectivity notice is about, without the count of waiting items: the same
  // condition must not pop up again just because a report was added to the queue.
  const condition = shown
    ? outbox.serverState === "online" && waiting > 0 && outbox.browserOnline !== false
      ? "sending"
      : `${outbox.serverState}|${outbox.browserOnline}`
    : null;
  // Gone (back online, nothing waiting): the next time it comes it is a new condition.
  useEffect(() => {
    if (condition === null) resetPopup("connectivity");
  }, [condition]);
  useEffect(() => {
    if (savedAt === null) resetPopup("saved-data");
  }, [savedAt]);

  const pillText = shown ? (PILL[outbox.serverState] ?? (outbox.serverState === "online" && !outbox.browserOnline ? "No internet" : null)) : null;
  const { Icon, text, short, tone } = shown ?? {};
  return (
    <div className="pointer-events-none fixed inset-x-3 top-[4.5rem] z-50 flex flex-col items-center gap-2 md:inset-x-auto md:top-3 md:right-6 md:items-end">
      <OfflineReady hideAfterMs={10_000} className="pointer-events-none max-w-xl bg-surface-raised/90 shadow-card-hover backdrop-blur-xl md:hidden [&_button]:pointer-events-auto" />
      {(pillText || savedAt !== null) && (
        <div className="flex flex-wrap items-center justify-center gap-1.5 md:justify-end" data-testid="status-pills">
          {pillText && (
            <Pill tone={shown.tone} Icon={shown.Icon} data-pill="offline">
              {pillText}
            </Pill>
          )}
          {savedAt !== null && (
            <Pill tone="warn" Icon={History} data-pill="saved-data">
              Saved data
            </Pill>
          )}
        </div>
      )}
      {shown && (
        <Popup id="connectivity" signature={condition} className={`max-w-xl max-md:items-center ${TONES[tone].box}`}>
          <Icon className={`mt-0.5 size-4 shrink-0 ${TONES[tone].icon}`} aria-hidden="true" />
          <span className="md:hidden">{short}</span>
          <span className="hidden md:inline">{text}</span>
        </Popup>
      )}
      {savedAt !== null && (
        <Popup id="saved-data" signature={String(savedAt)} className="max-w-xl border-warn/40">
          <History className="size-4 shrink-0 text-warn" aria-hidden="true" />
          <span>Saved data from {formatSavedTime(savedAt)}, not live</span>
        </Popup>
      )}
    </div>
  );
}
