// Shared by the scripts that write data: they must never touch a database that
// is not on this machine.

// Returns { host, db } for a local MongoDB connection string, or { error }.
export function localTarget(uri) {
  if (!uri) return { error: "MONGODB_URI is not set (see .env.local.example)." };
  let url;
  try {
    url = new URL(uri);
  } catch {
    return { error: "MONGODB_URI is not a single-host connection string, so it can't be verified as local." };
  }
  if (url.protocol !== "mongodb:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    return { error: `MONGODB_URI points at "${url.hostname || url.protocol}", not a local database.` };
  }
  return { host: url.host, db: url.pathname.replace(/^\//, "") };
}
