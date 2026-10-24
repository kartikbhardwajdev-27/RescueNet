import mongoose from "mongoose";
import { EVENT_STATUSES, EVENT_TYPES } from "../lib/eventRules.js";
import pointSchema from "./geoPoint.js";

export { EVENT_STATUSES, EVENT_TYPES };

// A volunteer drive, donation camp, training or awareness event that an
// organization posts and people can join.
const eventSchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, "Title is required"], trim: true },
    description: { type: String, required: [true, "Description is required"], trim: true },
    type: { type: String, enum: EVENT_TYPES, required: [true, "Event type is required"] },
    location: { type: pointSchema, required: [true, "Location is required"] },
    address: { type: String, required: [true, "Address is required"], trim: true },
    startsAt: { type: Date, required: [true, "Start time is required"] },
    endsAt: { type: Date },
    // Absent = no limit. Joining is checked against it atomically (see
    // app/api/events/[id]/rsvp/route.js), never by reading and then writing.
    capacity: { type: Number, min: 1 },
    organizer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    // The people who joined. Never sent to clients: the API only exposes how many
    // there are and whether the caller is one of them (lib/eventQueries.js).
    attendees: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    // "cancelled" is set by DELETE /api/events/[id]; the record is kept so the
    // people who joined can still see that it was cancelled.
    status: { type: String, enum: EVENT_STATUSES, default: "upcoming" },
    // true on the demo events made by `npm run demo:seed`. Never set by the API.
    seeded: { type: Boolean },
  },
  { timestamps: true },
);

eventSchema.index({ location: "2dsphere" });
eventSchema.index({ status: 1, startsAt: 1 });
eventSchema.index({ organizer: 1, startsAt: -1 });
eventSchema.index({ attendees: 1 });

export default mongoose.models.Event || mongoose.model("Event", eventSchema);
