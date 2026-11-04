"use client";

import { useEffect } from "react";
import { reportSavedData } from "@/lib/popups";

// "Saved data from 2:41 pm, not live": shown by a screen that is displaying a
// copy kept on the device because the server could not be reached (lib/savedData.js).
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

// Reports to the stack at the top of the screen (components/ConnectivityBanner.js), which shows
// the "Saved data from <time>, not live" pop-up (10 s, dismissible, back only when the saved
// data changes) and keeps the small "Saved data" pill for as long as this screen is showing a
// saved copy. Nothing is drawn here, so a notice coming and going never moves the page.
// `className` is accepted for the old call sites and ignored.
export function useReportSavedData(savedAt) {
  useEffect(() => {
    const reporter = `screen-${Math.random().toString(36).slice(2)}`;
    reportSavedData(reporter, typeof savedAt === "number" ? savedAt : null);
    return () => reportSavedData(reporter, null);
  }, [savedAt]);
}

export default function SavedDataBanner({ savedAt }) {
  useReportSavedData(savedAt);
  return null;
}
