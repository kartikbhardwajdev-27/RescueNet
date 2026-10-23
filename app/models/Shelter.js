import mongoose from "mongoose";
import { SHELTER_STATUSES } from "../lib/shelterRules.js";
import pointSchema from "./geoPoint.js";

export { SHELTER_STATUSES };

const shelterSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, "Name is required"], trim: true },
    address: { type: String, required: [true, "Address is required"], trim: true },
    location: { type: pointSchema, required: [true, "Location is required"] },
    capacity: { type: Number, required: [true, "Capacity is required"], min: 0 },
    occupied: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        // Document validators only: a query-level update bypasses `this`.
        validator(value) {
          return this.capacity == null || value <= this.capacity;
        },
        message: "Occupied cannot exceed capacity",
      },
    },
    status: { type: String, enum: SHELTER_STATUSES, default: "open" },
    contactPhone: { type: String, trim: true },
    // The organization that added it. Seeded demo shelters have none, which
    // is also what makes them read-only: nobody owns them.
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    seeded: { type: Boolean, default: false },
  },
  { timestamps: true },
);

shelterSchema.index({ location: "2dsphere" });

export default mongoose.models.Shelter || mongoose.model("Shelter", shelterSchema);
