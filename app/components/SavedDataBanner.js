import { History } from "lucide-react";

// "Saved data from 2:41 pm, not live": shown by a screen that is displaying a
// copy the Android app kept on the phone because the laptop could not be reached.
// Never appears on the website, which keeps no copy (lib/savedData.js).
//
// `savedAt` is a time in ms or null (null shows nothing). Pass the OLDEST
// savedAt among the lists a screen shows: oldestSavedAt(resourceA, resourceB).

export function oldestSavedAt(...resources) {
  const times = resources.map((resource) => resource.savedAt).filter((time) => typeof time === "number");
  return times.length > 0 ? Math.min(...times) : null;
}

// Today: "2:41 pm". Another day: "24 Oct, 2:41 pm".
export function formatSavedTime(savedAt, nowMs = Date.now()) {
  const when = new Date(savedAt);
  const time = when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return when.toDateString() === new Date(nowMs).toDateString()
    ? time
    : `${when.toLocaleDateString(undefined, { day: "numeric", month: "short" })}, ${time}`;
}

// Amber: the data may be out of date, which is a warning, not an emergency.
export default function SavedDataBanner({ savedAt, className = "" }) {
  if (savedAt === null || savedAt === undefined) return null;
  return (
    <p
      role="status"
      className={`flex items-center gap-2.5 rounded-2xl border border-warn/40 bg-warn/10 px-4 py-2.5 text-sm font-semibold text-ink ${className}`}
    >
      <History className="size-4 shrink-0 text-warn" aria-hidden="true" />
      Saved data from {formatSavedTime(savedAt)}, not live
    </p>
  );
}
