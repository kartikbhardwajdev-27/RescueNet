// Incident enums shared by the model, the server validation and the browser
// forms. Pure and dependency-free (the model itself imports mongoose, which
// must never end up in a browser bundle).

import { parseIsoDateTime } from "./isoDate.js";

export const INCIDENT_TYPES = ["flood", "fire", "earthquake", "medical", "other"];
export const INCIDENT_SEVERITIES = ["low", "medium", "high", "critical"];
export const INCIDENT_STATUSES = ["reported", "in_progress", "resolved"];

export const MAX_DESCRIPTION_LENGTH = 1000;

// ---- SOS alerts ----
//
// POST /api/sos stores an incident with `isSos: true`; POST /api/incidents stores
// `isSos: false`. Alerts saved before that field existed have no `isSos` at all,
// but they have an unmistakable shape: /api/sos always wrote the type "other",
// the severity "critical" and a description that starts with "SOS alert"
// (optionally followed by ": <message>"). A normal report cannot be mistaken for
// one: it is stored with `isSos: false`, and nothing a client sends can set the
// flag.

export const SOS_DESCRIPTION_PREFIX = "SOS alert";

export function isSosIncident(incident) {
  if (typeof incident.isSos === "boolean") return incident.isSos;
  return (
    incident.type === "other" &&
    incident.severity === "critical" &&
    typeof incident.description === "string" &&
    incident.description.startsWith(SOS_DESCRIPTION_PREFIX)
  );
}

// ---- capturedAt: when the person actually submitted a report ----
//
// A report or SOS made offline reaches the server later. The phone sends the
// moment it was made as `capturedAt`; the server keeps it next to `createdAt`
// (which stays the moment the server received it). The phone's clock is only
// trusted a little: the value is ignored unless it is a real date, not in the
// future, and not older than a week. Ignoring is silent (no error), so a wrong
// clock never stops a report being saved.

export const CAPTURED_AT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Returns a Date when `value` is acceptable, otherwise undefined. `value` may be
// an ISO 8601 string or a number of milliseconds since 1970. `nowMs` is the
// server's clock, passed in so the rule can be checked at any time.
export function parseCapturedAt(value, nowMs = Date.now()) {
  const ms = parseIsoDateTime(value); // NaN for anything unusable, objects and arrays included
  if (!Number.isFinite(ms)) return undefined;
  if (ms > nowMs) return undefined; // from the future: the phone's clock is ahead
  if (nowMs - ms > CAPTURED_AT_MAX_AGE_MS) return undefined; // too old to trust
  return new Date(ms);
}
