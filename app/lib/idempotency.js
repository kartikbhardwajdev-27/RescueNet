// Idempotency keys for POST /api/incidents and POST /api/sos.
//
// A phone that was offline queues a report and sends it when the connection
// returns. If the connection drops after the server saved the report but before
// the phone heard back, the phone sends it again. The key (generated once, on
// the phone, when the report is created) lets the server recognise the second
// request and hand back the first result instead of creating a duplicate.
//
// The header is optional, so curl and older clients keep working without it.

export const IDEMPOTENCY_HEADER = "Idempotency-Key";

// A UUID (36 characters) fits; so does any random token of 16 to 64 characters.
const KEY_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export function isValidIdempotencyKey(value) {
  return typeof value === "string" && KEY_PATTERN.test(value);
}

// Reads the header. Returns { key } (key is null when the header is absent) or
// { error } with a message for a 400 response when it is present but malformed.
export function readIdempotencyKey(request) {
  const value = request.headers.get(IDEMPOTENCY_HEADER);
  if (value === null) return { key: null };
  if (!isValidIdempotencyKey(value)) {
    return { error: `${IDEMPOTENCY_HEADER} must be 16 to 64 letters, digits, "-" or "_"` };
  }
  return { key: value };
}

// What is stored on the incident. Prefixed with the route so the same key sent
// to two different endpoints can never collide.
export const clientIdFor = (route, key) => `${route}:${key}`;

// True for MongoDB's duplicate-key error (the unique index on clientId).
export function isDuplicateKeyError(err) {
  return err?.code === 11000;
}

// Marks a response as a replay of an earlier request, so the caller (and tests)
// can tell it was not created just now.
export const REPLAY_HEADERS = { "Idempotent-Replayed": "true" };
