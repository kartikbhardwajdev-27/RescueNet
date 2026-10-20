import mongoose from "mongoose";
import pointSchema from "./geoPoint.js";

export const INCIDENT_TYPES = ["flood", "fire", "earthquake", "medical", "other"];
export const INCIDENT_SEVERITIES = ["low", "medium", "high", "critical"];
export const INCIDENT_STATUSES = ["reported", "in_progress", "resolved"];

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
  },
  { timestamps: true },
);

incidentSchema.index({ location: "2dsphere" });
incidentSchema.index({ status: 1, createdAt: -1 });

export default mongoose.models.Incident || mongoose.model("Incident", incidentSchema);
