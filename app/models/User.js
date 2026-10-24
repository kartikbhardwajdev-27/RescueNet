import mongoose from "mongoose";
import { ORG_TYPES, USER_ROLES } from "../lib/authRules.js";
import pointSchema from "./geoPoint.js";

export { ORG_TYPES, USER_ROLES };

// Used by the org validators below: org details only matter for organizations.
function isOrganization() {
  return this.role === "organization";
}

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, "Name is required"], trim: true },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: { type: String, required: [true, "Phone is required"], trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: USER_ROLES, default: "citizen" },
    location: { type: pointSchema },
    // true on the two demo accounts made by `npm run demo:seed`. Never set by the API.
    seeded: { type: Boolean },
    org: {
      orgName: {
        type: String,
        trim: true,
        required: [isOrganization, "Organization name is required for organizations"],
      },
      orgType: {
        type: String,
        enum: ORG_TYPES,
        required: [isOrganization, "Organization type is required for organizations"],
      },
      description: { type: String, trim: true },
      contactInfo: { type: String, trim: true },
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.passwordHash;
        return ret;
      },
    },
  },
);

export default mongoose.models.User || mongoose.model("User", userSchema);
