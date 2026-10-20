import {
  ORG_TYPES,
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
  USER_ROLES,
  isPasswordTooLong,
  isValidEmail,
  normalizeEmail,
} from "@/lib/authRules";
import { isLngLat } from "@/models/geoPoint";

// The login route imports these from here.
export { isPasswordTooLong, normalizeEmail };

// Everything below checks `typeof === "string"` first so a JSON object like
// { "$ne": null } can never reach a query.
const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

// Optional free-text field: absent is fine, present must be a string.
function optionalText(value, field, errors) {
  if (value == null) return undefined;
  if (typeof value !== "string") {
    errors[field] = `${field} must be text`;
    return undefined;
  }
  return value.trim();
}

// Returns { errors, data }. `errors` maps field -> message (empty when valid);
// `data` holds only the cleaned, whitelisted fields (never the password).
export function validateRegistration(body) {
  const errors = {};
  const data = {};

  if (!isNonEmptyString(body.name)) errors.name = "Name is required";
  else data.name = body.name.trim();

  if (!isNonEmptyString(body.email)) {
    errors.email = "Email is required";
  } else {
    const email = normalizeEmail(body.email);
    if (isValidEmail(email)) data.email = email;
    else errors.email = "Email format is invalid";
  }

  if (!isNonEmptyString(body.phone)) errors.phone = "Phone is required";
  else data.phone = body.phone.trim();

  if (typeof body.password !== "string" || body.password.length === 0) {
    errors.password = "Password is required";
  } else if (body.password.length < PASSWORD_MIN_LENGTH) {
    errors.password = `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  } else if (isPasswordTooLong(body.password)) {
    errors.password = `Password must be at most ${PASSWORD_MAX_BYTES} bytes`;
  }

  const role = body.role ?? "citizen";
  if (USER_ROLES.includes(role)) data.role = role;
  else errors.role = `Role must be one of: ${USER_ROLES.join(", ")}`;

  if (body.location != null) {
    const { location } = body;
    const validPoint =
      typeof location === "object" &&
      (location.type == null || location.type === "Point") &&
      isLngLat(location.coordinates);
    if (validPoint) data.location = { type: "Point", coordinates: [...location.coordinates] };
    else errors.location = 'Location must be a GeoJSON point: { "type": "Point", "coordinates": [lng, lat] }';
  }

  // Org details only apply to organizations; for citizens they are ignored.
  if (data.role === "organization") {
    const org = body.org;
    if (org === null || typeof org !== "object" || Array.isArray(org)) {
      errors["org.orgName"] = "Organization name is required for organizations";
      errors["org.orgType"] = `Organization type is required for organizations (one of: ${ORG_TYPES.join(", ")})`;
    } else {
      const validName = isNonEmptyString(org.orgName);
      const validType = ORG_TYPES.includes(org.orgType);
      if (!validName) errors["org.orgName"] = "Organization name is required for organizations";
      if (!validType) errors["org.orgType"] = `Organization type must be one of: ${ORG_TYPES.join(", ")}`;
      const description = optionalText(org.description, "org.description", errors);
      const contactInfo = optionalText(org.contactInfo, "org.contactInfo", errors);
      if (validName && validType) {
        data.org = { orgName: org.orgName.trim(), orgType: org.orgType, description, contactInfo };
      }
    }
  }

  return { errors, data };
}
