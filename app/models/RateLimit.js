import mongoose from "mongoose";

// One counter per (limit name, client, time window) for the hosted rate limiter
// (lib/rateLimit.js). `_id` is a hash of those three, so the same caller in the same window
// always updates the same document, atomically. MongoDB deletes each document by itself
// shortly after its window ends (the TTL index on `expiresAt`; its monitor runs about
// once a minute, so expired counters can live a little longer, which never matters because
// a new window has a new `_id`).
const rateLimitSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    count: { type: Number, required: true, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false, timestamps: false },
);

rateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.RateLimit || mongoose.model("RateLimit", rateLimitSchema);
