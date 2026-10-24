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
