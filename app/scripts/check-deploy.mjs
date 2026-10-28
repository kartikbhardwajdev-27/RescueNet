// Checks for hosted-deploy readiness (Step 29):
//
//   npm run check:deploy
//
// Pure checks (environment check, the hosted-seed guards, which rate-limit store is chosen, the
// client address, the connection options) plus the MongoDB-backed rate limiter against a SCRATCH
// database on the local MongoDB (rescuenet_scratch_limiter, dropped at the end). It never
// touches the real "rescuenet" database.
import mongoose from "mongoose";
import { checkEnv } from "../lib/env.js";
import { connectOptions } from "../lib/db.js";
import { RATE_LIMITS, chooseStore, clientIp, rateLimit, windowFor } from "../lib/rateLimit.js";
import RateLimit from "../models/RateLimit.js";
import { demoPasswordProblem, describeHostedTarget } from "./hostedGuard.mjs";

const failures = [];
let count = 0;
const check = (name, actual, expected) => {
  count += 1;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
};
const req = (headers = {}) => new Request("http://x/api", { headers });

// ---- environment check ----
check("env: both missing", checkEnv({}).missing, ["MONGODB_URI", "JWT_SECRET"]);
check("env: blank counts as missing", checkEnv({ MONGODB_URI: "  ", JWT_SECRET: "" }).missing, ["MONGODB_URI", "JWT_SECRET"]);
check("env: only the secret missing", checkEnv({ MONGODB_URI: "mongodb://a/b" }).missing, ["JWT_SECRET"]);
check("env: 31 characters is rejected", checkEnv({ MONGODB_URI: "u", JWT_SECRET: "a".repeat(31) }).ok, false);
check("env: 32 characters is accepted", checkEnv({ MONGODB_URI: "u", JWT_SECRET: "a".repeat(32) }).ok, true);
check("env: change_me is rejected", checkEnv({ MONGODB_URI: "u", JWT_SECRET: "change_me" }).problems.length, 1);
{
  const result = checkEnv({ MONGODB_URI: "mongodb+srv://user:SECRETPASS@host/db", JWT_SECRET: "short-secret-value" });
  check("env: the report names the variable and never a value", [JSON.stringify(result).includes("SECRETPASS"), JSON.stringify(result).includes("short-secret-value")], [false, false]);
}

// ---- connection options ----
check("db: small pool and short timeouts by default", connectOptions({}), { bufferCommands: false, maxPoolSize: 5, minPoolSize: 0, serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000, socketTimeoutMS: 20000, maxIdleTimeMS: 30000 });
check("db: the pool can be raised, junk is ignored", [connectOptions({ MONGODB_MAX_POOL: "12" }).maxPoolSize, connectOptions({ MONGODB_MAX_POOL: "x" }).maxPoolSize, connectOptions({ MONGODB_MAX_POOL: "0" }).maxPoolSize], [12, 5, 5]);

// ---- hosted seed guards ----
check("seed: no password", demoPasswordProblem(undefined)?.startsWith("DEMO_PASSWORD is not set"), true);
check("seed: the laptop default is refused", /default/.test(demoPasswordProblem("demo-rescuenet-2026")), true);
check("seed: too short", /too short/.test(demoPasswordProblem("Abc123!xyz")), true);
check("seed: common word", /common word/.test(demoPasswordProblem("MyPassword-9271-ok")), true);
check("seed: a good password passes", demoPasswordProblem("tulip-granite-47-sparrow"), null);
check("seed: the password is never echoed", JSON.stringify(demoPasswordProblem("Zq9-vk2")).includes("Zq9-vk2"), false);
check("seed: Atlas string, no credentials shown", describeHostedTarget("mongodb+srv://me:pw@cluster0.abc.mongodb.net/rescuenet?retryWrites=true"), { host: "cluster0.abc.mongodb.net", db: "rescuenet", local: false });
check("seed: local string is flagged", describeHostedTarget("mongodb://127.0.0.1:27017/rescuenet").local, true);
check("seed: no database name", /no database name/.test(describeHostedTarget("mongodb+srv://me:pw@c.mongodb.net/?x=1").error), true);
check("seed: not a mongodb string", describeHostedTarget("https://example.com/db").error, "MONGODB_URI must start with mongodb:// or mongodb+srv://.");
check("seed: unset", describeHostedTarget("").error, "MONGODB_URI is not set.");

// ---- which store, which address ----
check("store: laptop (local db) uses memory", chooseStore({ MONGODB_URI: "mongodb://127.0.0.1:27017/rescuenet" }), "memory");
check("store: Atlas uses mongo", chooseStore({ MONGODB_URI: "mongodb+srv://u:p@c.mongodb.net/db" }), "mongo");
check("store: Vercel uses mongo", chooseStore({ VERCEL: "1", MONGODB_URI: "mongodb://127.0.0.1/x" }), "mongo");
check("store: the override wins", [chooseStore({ RATE_LIMIT_STORE: "memory", VERCEL: "1" }), chooseStore({ RATE_LIMIT_STORE: "mongo", MONGODB_URI: "mongodb://localhost/x" })], ["memory", "mongo"]);
check("store: nothing set means memory", chooseStore({}), "memory");
check("ip: on Vercel the platform header is used", clientIp(req({ "x-vercel-forwarded-for": "203.0.113.7", "x-forwarded-for": "9.9.9.9, 198.51.100.2" }), { VERCEL: "1" }), "203.0.113.7");
check("ip: off Vercel that header is ignored (it could be forged)", clientIp(req({ "x-vercel-forwarded-for": "203.0.113.7", "x-forwarded-for": "9.9.9.9, 198.51.100.2" }), {}), "198.51.100.2");
check("ip: last x-forwarded-for entry, then x-real-ip, then unknown", [clientIp(req({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }), {}), clientIp(req({ "x-real-ip": "5.5.5.5" }), {}), clientIp(req(), {})], ["2.2.2.2", "5.5.5.5", "unknown"]);
check("windows are clock aligned", [windowFor(1_000_500, 1000), windowFor(1_000_000, 1000)], [{ start: 1_000_000, end: 1_001_000 }, { start: 1_000_000, end: 1_001_000 }]);

// ---- memory limiter: same limits as before ----
{
  const t = 5_000_000;
  const ip = { "x-forwarded-for": "192.0.2.1" };
  const results = [];
  for (let i = 0; i < 12; i++) results.push((await rateLimit(req(ip), "sos", { store: "memory", now: t, key: "mem-test" }))?.status ?? 200);
  check("memory: sos allows 10 then 429", [results.slice(0, 10).every((s) => s === 200), results.slice(10)], [true, [429, 429]]);
  const limited = await rateLimit(req(ip), "sos", { store: "memory", now: t, key: "mem-test" });
  check("memory: the 429 carries Retry-After and a message", [limited.headers.get("Retry-After") !== null, (await limited.json()).error], [true, "Too many requests, try again shortly"]);
  check("memory: allowed again after the window", await rateLimit(req(ip), "sos", { store: "memory", now: t + RATE_LIMITS.sos.windowMs + 1, key: "mem-test" }), null);
}

// ---- MongoDB limiter, on a scratch database ----
const SCRATCH = "mongodb://127.0.0.1:27017/rescuenet_scratch_limiter";
await mongoose.connect(SCRATCH, { serverSelectionTimeoutMS: 4000 });
process.env.MONGODB_URI = SCRATCH; // lib/db.js reuses this connection
try {
  await mongoose.connection.dropDatabase();
  const t = 7_000_000_000;
  const ip = { "x-forwarded-for": "198.51.100.77" };
  const status = async (route, opts = {}) => (await rateLimit(req(ip), route, { store: "mongo", now: t, ...opts }))?.status ?? 200;

  const seq = [];
  for (let i = 0; i < 12; i++) seq.push(await status("incidents"));
  check("mongo: incidents (limit 10) allows 10 then 429", [seq.slice(0, 10).every((s) => s === 200), seq.slice(10)], [true, [429, 429]]);

  const other = await status("sos");
  check("mongo: another route has its own count", other, 200);

  const parallel = await Promise.all(Array.from({ length: 30 }, () => status("sos", { key: "parallel" })));
  check("mongo: 30 simultaneous requests, limit 10: exactly 10 allowed", [parallel.filter((s) => s === 200).length, parallel.filter((s) => s === 429).length], [10, 20]);

  const limited = await rateLimit(req(ip), "incidents", { store: "mongo", now: t + 1000 });
  const retry = Number(limited.headers.get("Retry-After"));
  const { end } = windowFor(t + 1000, RATE_LIMITS.incidents.windowMs);
  check("mongo: Retry-After is the time to the end of the window", retry, Math.ceil((end - (t + 1000)) / 1000));
  check("mongo: allowed again in the next window", await status("incidents", { now: end + 1 }), 200);

  const login = [];
  for (let i = 0; i < 17; i++) login.push((await rateLimit(req(ip), "loginAccount", { store: "mongo", now: t, key: "someone@example.com" }))?.status ?? 200);
  check("mongo: per-account login limit is 15", [login.filter((s) => s === 200).length, login.filter((s) => s === 429).length], [15, 2]);
  check("mongo: a different account is counted separately", (await rateLimit(req(ip), "loginAccount", { store: "mongo", now: t, key: "other@example.com" })) === null, true);

  const docs = await RateLimit.find().lean();
  check("mongo: no address or e-mail is stored", JSON.stringify(docs).includes("198.51.100.77") || JSON.stringify(docs).includes("example.com"), false);
  check("mongo: every counter has an expiry after its window", docs.every((d) => d.expiresAt.getTime() > t), true);
  const indexes = await RateLimit.collection.indexes();
  check("mongo: the TTL index exists", indexes.some((ix) => ix.key.expiresAt === 1 && ix.expireAfterSeconds === 0), true);
} finally {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}

if (failures.length > 0) {
  console.error(`${failures.length} of ${count} checks FAILED:\n`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`All ${count} deploy-readiness checks passed.`);
