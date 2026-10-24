// Strict date-time parsing for API input. Pure and dependency-free: it is used
// by the server validation and (through incidentRules / eventRules) by browser
// code.
//
// Date.parse alone is too forgiving: it turns 2026-02-30 into March 2, reads a
// date with no time zone in the server's own zone, and accepts free text such as
// "Oct 24 2026". This accepts only ISO 8601 with an explicit time zone
// ("2026-10-24T09:15:30.123Z" or "...+05:30"), checks that every part is in
// range and that the day exists in that month, or a number of milliseconds since
// 1970. Anything else is NaN.

const ISO_WITH_ZONE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-](\d{2}):(\d{2}))$/;

function isoToMs(text) {
  const match = ISO_WITH_ZONE.exec(text);
  if (!match) return NaN;
  const [, year, month, day, hour, minute, second = "0", offsetHour = "0", offsetMinute = "0"] = match;
  const [y, mo, d, h, mi, s, oh, om] = [year, month, day, hour, minute, second, offsetHour, offsetMinute].map(Number);
  const dayExists = new Date(Date.UTC(y, mo - 1, d)).getUTCDate() === d;
  if (mo < 1 || mo > 12 || !dayExists || h > 23 || mi > 59 || s > 59 || oh > 23 || om > 59) return NaN;
  return Date.parse(text);
}

// Milliseconds since 1970, or NaN when `value` is not an acceptable date-time
// (including anything that is not a string or a number).
export function parseIsoDateTime(value) {
  if (typeof value === "string") return isoToMs(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  return NaN;
}
