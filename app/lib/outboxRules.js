// Rules for the offline outbox (lib/outbox.js), kept free of browser APIs so
// they are easy to reason about and to check on their own.
//
// An outbox item is a report or an SOS that was made on this device and has
// not been confirmed by the server yet:
//
//   { id, kind, payload, status, createdAt, updatedAt, attempts, nextAttemptAt,
//     lastError, result }
//
//   id             client-generated; also sent as the Idempotency-Key, so the
//                  server can tell a repeat from a new report
//   kind           "sos" | "report"
//   status         "queued"   waiting to be sent (first try or a retry)
//                  "sending"  a request is in flight right now
//                  "sent"     the server confirmed it
//                  "failed"   the server rejected it and a retry cannot help
//   nextAttemptAt  not before this time (ms); 0 = as soon as possible
//   retryReason    why it is waiting: the failure kind ("network", "rate_limit",
//                  "server"). A "network" wait ends the moment the server is
//                  reachable again; the others wait their time.

export const OUTBOX_KINDS = ["sos", "report"];
export const OUTBOX_STATUSES = ["queued", "sending", "sent", "failed"];

// A "sending" item whose tab vanished (closed, crashed) is put back in the
// queue after this long. It must be longer than the request timeout (15 s).
export const SENDING_STALE_MS = 25_000;

// Confirmed items stay in the list this long, so a person can see that their
// report went through, then they are removed.
export const SENT_KEEP_MS = 24 * 60 * 60 * 1000;

export const isPending = (item) => item.status === "queued" || item.status === "sending";

// Whether a failed API result (see lib/api.js) is worth trying again later.
// Network trouble, a busy server and rate limits pass; a request the server
// has refused (invalid data, not allowed) will be refused again.
export function isRetryable(result) {
  if (result.kind === "network" || result.kind === "rate_limit") return true;
  if (result.kind === "server") return result.status >= 500 || result.status === 408;
  return false;
}

// How long to wait before the next attempt. An SOS is retried more often.
// `retryAfterSeconds` is the server's own Retry-After (rate limits).
export function retryDelayMs({ attempts, kind, retryAfterSeconds = 0 }) {
  if (retryAfterSeconds > 0) return Math.min(10 * 60_000, Math.max(1000, retryAfterSeconds * 1000));
  const cap = kind === "sos" ? 15_000 : 60_000;
  return Math.min(cap, 3000 * 2 ** Math.max(0, attempts - 1));
}

// The next item to send: due, not in a blocked kind, SOS before reports, then oldest first.
export function pickNext(items, now, blockedKinds = new Set()) {
  const due = items.filter((item) => item.status === "queued" && item.nextAttemptAt <= now && !blockedKinds.has(item.kind));
  due.sort((a, b) => (a.kind === b.kind ? a.createdAt - b.createdAt : a.kind === "sos" ? -1 : 1));
  return due[0] ?? null;
}

export const isStaleSending = (item, now) => item.status === "sending" && now - item.updatedAt > SENDING_STALE_MS;

export const isExpiredSent = (item, now) => item.status === "sent" && now - (item.sentAt ?? item.updatedAt) > SENT_KEEP_MS;

// Newest first, for lists.
export const byNewest = (a, b) => b.createdAt - a.createdAt;

// A random id in UUID v4 format. crypto.randomUUID() only exists on secure
// origins (https or localhost), so a phone opening http://<laptop-ip> needs
// the getRandomValues route, which works everywhere.
export function newClientId(cryptoObject = globalThis.crypto) {
  if (typeof cryptoObject?.randomUUID === "function") return cryptoObject.randomUUID();
  const bytes = new Uint8Array(16);
  cryptoObject.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
