// The safety rules for `npm run demo:seed:hosted`, kept apart so they can be tested
// (scripts/check-deploy.mjs).

export const LOCAL_DEFAULT_PASSWORD = "demo-rescuenet-2026";
export const MIN_DEMO_PASSWORD = 12;
const WEAK = ["password", "passw0rd", "12345678", "qwertyuiop", "letmein", "rescuenet", "demo-rescuenet", "changeme", "change_me"];

// null when the password is acceptable, else the reason (never echoes the password).
export function demoPasswordProblem(password) {
  if (!password) return "DEMO_PASSWORD is not set. Put a password of your own in the environment (not in a file you commit).";
  if (password === LOCAL_DEFAULT_PASSWORD) return "DEMO_PASSWORD is the default used on the laptop. Choose a different one for a hosted database.";
  if (password.length < MIN_DEMO_PASSWORD) return `DEMO_PASSWORD is too short (${password.length} characters; at least ${MIN_DEMO_PASSWORD}).`;
  if (new Set(password).size < 5) return "DEMO_PASSWORD has too few different characters.";
  const lower = password.toLowerCase();
  if (WEAK.some((word) => lower.includes(word))) return "DEMO_PASSWORD contains a common word (password, rescuenet, 12345678 ...). Choose something else.";
  return null;
}

// Where a connection string points, without the user name or password:
// { host, db, local } or { error }.
export function describeHostedTarget(uri) {
  if (!uri) return { error: "MONGODB_URI is not set." };
  let url;
  try {
    url = new URL(uri);
  } catch {
    return { error: "MONGODB_URI is not a valid connection string." };
  }
  if (url.protocol !== "mongodb:" && url.protocol !== "mongodb+srv:") return { error: "MONGODB_URI must start with mongodb:// or mongodb+srv://." };
  const db = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!db) return { error: "MONGODB_URI has no database name (…mongodb.net/<name>?…). Add one, so it is clear where the demo data goes." };
  const local = url.protocol === "mongodb:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  return { host: url.hostname, db, local };
}
