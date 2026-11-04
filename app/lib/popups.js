// Shared state behind every pop-up notice (components/Popup.js): which ones are on
// screen, which were dismissed, and which state the app is in right now (for the small
// "Offline" and "Saved data" pills that stay when a notice has gone).
//
//   - A pop-up that is dismissed (by the x or by its 10 s timer) stays dismissed while its
//     `signature` is unchanged, however often the screen re-renders or refetches. It comes
//     back only when the signature changes (offline again, a new error, newer saved data).
//   - At most MAX_POPUPS are shown at once, in the order they appeared; the rest wait.
//   - Screens that show saved data report it here (reportSavedData); the notice itself is
//     drawn once, in the stack at the top (components/ConnectivityBanner.js).

export const POPUP_MS = 10_000;
export const MAX_POPUPS = 3;

let version = 0;
const listeners = new Set();
const emit = () => {
  version += 1;
  for (const listener of listeners) listener();
};
export const subscribePopups = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const getPopupsVersion = () => version;

const dismissed = new Map(); // id -> signature that was dismissed
let active = []; // ids wanting to be shown, in order of appearance

export const isDismissed = (id, signature) => dismissed.get(id) === signature;
export function dismissPopup(id, signature) {
  dismissed.set(id, signature);
  emit();
}
// The condition went away: next time it appears it is new again.
export function resetPopup(id) {
  if (dismissed.delete(id)) emit();
}
export function registerPopup(id) {
  if (!active.includes(id)) {
    active = [...active, id];
    emit();
  }
  return () => {
    active = active.filter((x) => x !== id);
    emit();
  };
}
export const popupRank = (id) => active.indexOf(id);

// ---- what the screens are showing (for the pills) ----

const savedReports = new Map(); // reporter -> savedAt (ms)
export function reportSavedData(reporter, savedAt) {
  if (typeof savedAt === "number") savedReports.set(reporter, savedAt);
  else savedReports.delete(reporter);
  emit();
}
export function oldestReportedSavedAt() {
  const times = [...savedReports.values()];
  return times.length > 0 ? Math.min(...times) : null;
}
