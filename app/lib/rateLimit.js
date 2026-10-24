// Small in-memory fixed-window rate limiter, keyed by client IP + route name.
//
// State lives in this server process only: it resets on restart and is not
// shared between instances, so treat it as a brake on abuse, not a guarantee.
// The client IP is the LAST x-forwarded-for entry, which is the one a reverse
// proxy appends. Without a proxy in front a client can set that header itself
// and dodge the limit.

export const RATE_LIMITS = {
  login: { limit: 10, windowMs: 15 * 60 * 1000 },
  // Counted per account (the email tried), not per address: see the login route.
  loginAccount: { limit: 15, windowMs: 15 * 60 * 1000 },
  register: { limit: 10, windowMs: 60 * 60 * 1000 },
  incidents: { limit: 10, windowMs: 10 * 60 * 1000 },
  sos: { limit: 10, windowMs: 10 * 60 * 1000 },
  shelters: { limit: 20, windowMs: 60 * 60 * 1000 },
  events: { limit: 20, windowMs: 60 * 60 * 1000 },
  rsvp: { limit: 60, windowMs: 10 * 60 * 1000 },
  // Changing things that already exist (status, shelter, event). Logged-in
  // organizations only, but an organization account is free to make.
  updates: { limit: 60, windowMs: 10 * 60 * 1000 },
};

const PRUNE_INTERVAL_MS = 60 * 1000;
// Cap on tracked IP+route pairs, so a flood of distinct (spoofed) IPs can't grow
// memory without bound. At the cap the oldest entry is evicted to make room.
const MAX_BUCKETS = 10_000;

// On globalThis so dev hot reloads don't reset every counter.
const buckets = (globalThis._rateLimitBuckets ??= new Map());
let lastPrune = 0;

function clientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const last = forwarded?.split(",").at(-1).trim();
  return last || request.headers.get("x-real-ip")?.trim() || "unknown";
}

function prune(now) {
  if (now - lastPrune < PRUNE_INTERVAL_MS) return;
  lastPrune = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

// Counts this request against `routeName`'s limit. Returns null when allowed,
// or a ready-made 429 Response when the caller is over the limit:
//   const limited = rateLimit(request, "login");
//   if (limited) return limited;
// By default the limit is per client address; pass { key } to count against
// something else instead (for example the account being logged into).
export function rateLimit(request, routeName, { key: subject } = {}) {
  const config = RATE_LIMITS[routeName];
  if (!config) throw new Error(`No rate limit configured for "${routeName}"`);

  const now = Date.now();
  prune(now);

  const key = `${routeName}:${subject ?? clientIp(request)}`;
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    // Maps iterate in insertion order, so the first key is the oldest.
    if (!bucket && buckets.size >= MAX_BUCKETS) buckets.delete(buckets.keys().next().value);
    bucket = { count: 0, resetAt: now + config.windowMs };
    buckets.set(key, bucket);
  }

  bucket.count += 1;
  if (bucket.count <= config.limit) return null;

  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  return Response.json(
    { error: "Too many requests, try again shortly" },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}
