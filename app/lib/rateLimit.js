// Fixed-window rate limiter, keyed by client IP + route name (or another subject, such as the
// account being logged into). Two stores, with the same limits:
//
//   memory  Counters live in this server process only: they reset on restart and are not shared
//           between instances. Used on the laptop. Fine as a brake on abuse there.
//   mongo   Counters live in MongoDB (collection "ratelimits", one small document per caller per
//           window, deleted by a TTL index). Shared by every serverless instance, so the limit
//           holds on Vercel, where each request may reach a different instance. Used when the
//           database is not on this machine, or when RATE_LIMIT_STORE=mongo.
//
// RATE_LIMIT_STORE=memory|mongo overrides the choice. If the database cannot be reached the
// limiter lets the request through (the request would fail on the database anyway) and logs it.
//
// THE CLIENT ADDRESS. On Vercel (VERCEL=1) it comes from x-vercel-forwarded-for, which Vercel
// sets itself and a client cannot forge. Anywhere else it is the LAST x-forwarded-for entry, the
// one a reverse proxy appends; with no proxy in front, a client can send that header itself and
// pick its own address, so the per-address limits can be dodged (the per-account login limit
// still holds). Never trust these headers unless the platform in front of the app sets them.

import { createHash } from "node:crypto";

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

// The caller's address as far as it can be known (see the note at the top about trusting it).
export function clientIp(request, env = process.env) {
  const headers = request.headers;
  if (env.VERCEL) {
    const vercel = headers.get("x-vercel-forwarded-for")?.split(",")[0].trim();
    if (vercel) return vercel;
  }
  const forwarded = headers.get("x-forwarded-for");
  const last = forwarded?.split(",").at(-1).trim();
  return last || headers.get("x-real-ip")?.trim() || "unknown";
}

// "memory" or "mongo": see the note at the top.
export function chooseStore(env = process.env) {
  if (env.RATE_LIMIT_STORE === "memory" || env.RATE_LIMIT_STORE === "mongo") return env.RATE_LIMIT_STORE;
  if (env.VERCEL) return "mongo";
  try {
    const url = new URL(env.MONGODB_URI ?? "");
    const local = url.protocol === "mongodb:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
    return local ? "memory" : "mongo";
  } catch {
    return "memory";
  }
}

function prune(now) {
  if (now - lastPrune < PRUNE_INTERVAL_MS) return;
  lastPrune = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

// The window a moment falls in: windows are aligned to the clock, so every instance agrees.
export function windowFor(now, windowMs) {
  const start = Math.floor(now / windowMs) * windowMs;
  return { start, end: start + windowMs };
}

function hitMemory(key, config, now) {
  prune(now);
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    // Maps iterate in insertion order, so the first key is the oldest.
    if (!bucket && buckets.size >= MAX_BUCKETS) buckets.delete(buckets.keys().next().value);
    bucket = { count: 0, resetAt: now + config.windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  return { count: bucket.count, resetAt: bucket.resetAt };
}

// Adds one to this caller's counter for the current window, atomically. The document id is a
// hash, so no address or e-mail is stored in the database.
async function hitMongo(key, config, now) {
  const [{ default: connectDB }, { default: ensureIndexes }, { default: RateLimit }] = await Promise.all([
    import("./db.js"),
    import("./ensureIndexes.js"),
    import("../models/RateLimit.js"),
  ]);
  await connectDB();
  await ensureIndexes(RateLimit);
  const { start, end } = windowFor(now, config.windowMs);
  const id = createHash("sha256").update(`${key}|${start}`).digest("hex").slice(0, 40);
  for (let attempt = 0; ; attempt += 1) {
    try {
      const doc = await RateLimit.findOneAndUpdate(
        { _id: id },
        { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(end + 60_000) } },
        { upsert: true, returnDocument: "after", lean: true },
      );
      return { count: doc.count, resetAt: end };
    } catch (error) {
      // Two instances creating the same counter at once: one gets a duplicate-key error. Retry once.
      if (error?.code === 11000 && attempt === 0) continue;
      throw error;
    }
  }
}

// Counts this request against `routeName`'s limit. Returns null when allowed,
// or a ready-made 429 Response when the caller is over the limit:
//   const limited = await rateLimit(request, "login");
//   if (limited) return limited;
// By default the limit is per client address; pass { key } to count against
// something else instead (for example the account being logged into).
// `store` and `now` are for the tests.
export async function rateLimit(request, routeName, { key: subject, store = chooseStore(), now = Date.now() } = {}) {
  const config = RATE_LIMITS[routeName];
  if (!config) throw new Error(`No rate limit configured for "${routeName}"`);

  const key = `${routeName}:${subject ?? clientIp(request)}`;
  let hit;
  if (store === "mongo") {
    try {
      hit = await hitMongo(key, config, now);
    } catch (error) {
      console.error("[rate limit] the database could not be reached, letting the request through:", error.message);
      return null;
    }
  } else {
    hit = hitMemory(key, config, now);
  }
  if (hit.count <= config.limit) return null;

  const retryAfterSeconds = Math.max(1, Math.ceil((hit.resetAt - now) / 1000));
  return Response.json(
    { error: "Too many requests, try again shortly" },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}
