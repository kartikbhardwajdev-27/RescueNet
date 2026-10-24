// "Sat, 24 Oct · 10:00 to 12:00" or, over midnight, "Sat, 24 Oct, 22:00 to Sun, 25 Oct, 02:00".
// Local time of the viewer. Only called with data fetched in the browser, so the
// server and the browser never render different text.
const DAY = { weekday: "short", day: "numeric", month: "short" };
const HOUR = { hour: "2-digit", minute: "2-digit" };

export function formatEventWhen(startsAt, endsAt) {
  const start = new Date(startsAt);
  const day = (date) => date.toLocaleDateString(undefined, DAY);
  const time = (date) => date.toLocaleTimeString(undefined, HOUR);
  if (!endsAt) return `${day(start)} · ${time(start)}`;
  const end = new Date(endsAt);
  if (start.toDateString() === end.toDateString()) return `${day(start)} · ${time(start)} to ${time(end)}`;
  return `${day(start)}, ${time(start)} to ${day(end)}, ${time(end)}`;
}

// A <input type="datetime-local"> value ("2026-10-24T10:00", the viewer's own
// time) for a moment `ms` since 1970.
export function toDateTimeLocalValue(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
