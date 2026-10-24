import mongoose from "mongoose";
import { INCIDENT_SEVERITIES, INCIDENT_STATUSES, INCIDENT_TYPES } from "../lib/incidentRules.js";
import pointSchema from "./geoPoint.js";

export { INCIDENT_SEVERITIES, INCIDENT_STATUSES, INCIDENT_TYPES };

const incidentSchema = new mongoose.Schema(
  {
    type: { type: String, enum: INCIDENT_TYPES, required: [true, "Incident type is required"] },
    description: { type: String, required: [true, "Description is required"], trim: true },
    location: { type: pointSchema, required: [true, "Location is required"] },
    address: { type: String, trim: true },
    severity: { type: String, enum: INCIDENT_SEVERITIES, default: "medium" },
    status: { type: String, enum: INCIDENT_STATUSES, default: "reported" },
    // true only for alerts made with the SOS button, false for ordinary reports.
    // Set explicitly by POST /api/sos and POST /api/incidents, never by anything
    // a client sends. Deliberately NO schema default: Mongoose applies a default
    // to an old document that lacks the field the moment it is loaded, which
    // would turn every alert saved before this field existed into "not an SOS".
    // A missing field is how old alerts are recognised (see isSosIncident in
    // lib/incidentRules.js).
    isSos: { type: Boolean },
    // "Suggested priority": the keyword score of the description and the
    // keywords that earned it (lib/triage.js). Worked out by the server when the
    // report arrives, never taken from the request. Absent on older incidents,
    // so no defaults here (an empty `reasons` array would otherwise be added to
    // every old document the moment it is loaded).
    triage: {
      score: { type: Number, min: 0, max: 100 },
      reasons: { type: [String], default: undefined },
    },
    // true on the demo incidents made by `npm run demo:seed` (scripts/seed-demo.mjs).
    // Never set by the API, only by that script; shown as a "Demo" tag. No default,
    // like isSos, so ordinary incidents simply do not have the field.
    seeded: { type: Boolean },
    // Optional so anonymous reports are allowed.
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    // When the person actually submitted it, as reported by their device. Absent
    // when the sender gave none, or one the server could not trust (see
    // parseCapturedAt in lib/incidentRules.js). createdAt stays the moment the
    // server received it.
    capturedAt: { type: Date },
    // "<route>:<Idempotency-Key>" for reports that came through the offline
    // queue (see lib/idempotency.js). Never returned by queries or in JSON.
    clientId: { type: String, select: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.clientId;
        return ret;
      },
    },
  },
);

incidentSchema.index({ location: "2dsphere" });
incidentSchema.index({ status: 1, createdAt: -1 });
// One incident per key. Partial, so the many incidents without a key do not count.
incidentSchema.index({ clientId: 1 }, { unique: true, partialFilterExpression: { clientId: { $type: "string" } } });

export default mongoose.models.Incident || mongoose.model("Incident", incidentSchema);
