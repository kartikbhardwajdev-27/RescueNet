import mongoose from "mongoose";

// One connection per server process, kept on globalThis: dev hot reloads reset module state, and
// on a serverless platform (Vercel) a warm function instance is reused for many requests, so
// the connection is opened once per instance, not once per request.
const cached = (globalThis._mongoose ??= { conn: null, promise: null });

// Settings that suit a serverless function talking to Atlas: a small pool (every warm instance
// holds its own, and Atlas free clusters allow few connections in total), short timeouts so a
// bad address fails in seconds instead of hanging the request, and idle sockets closed early.
// MONGODB_MAX_POOL can raise the pool for a long-running server.
export function connectOptions(env = process.env) {
  const pool = Number.parseInt(env.MONGODB_MAX_POOL ?? "", 10);
  return {
    bufferCommands: false,
    maxPoolSize: Number.isInteger(pool) && pool > 0 ? pool : 5,
    minPoolSize: 0,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
    socketTimeoutMS: 20_000,
    maxIdleTimeMS: 30_000,
  };
}

export default async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set (see .env.local.example)");
  }

  // Connected (readyState 1): reuse it. After a drop the driver reconnects by itself; if it has
  // given up (disconnected), start over.
  if (cached.conn && mongoose.connection.readyState === 1) return cached.conn;
  if (cached.conn && mongoose.connection.readyState !== 2) {
    cached.conn = null;
    cached.promise = null;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(uri, connectOptions()).catch((err) => {
      // Don't cache a failed attempt, so the next call can retry.
      cached.promise = null;
      throw err;
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}
