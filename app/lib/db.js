import mongoose from "mongoose";

// Module state is reset on every hot reload in dev, so keep the connection on
// globalThis to avoid opening a new one each time.
const cached = (globalThis._mongoose ??= { conn: null, promise: null });

export default async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set (see .env.local.example)");
  }

  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(uri, {
        bufferCommands: false,
        serverSelectionTimeoutMS: 3000,
      })
      .catch((err) => {
        // Don't cache a failed attempt, so the next call can retry.
        cached.promise = null;
        throw err;
      });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}
