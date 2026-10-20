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
import { INCIDENT_SEVERITIES, INCIDENT_STATUSES, INCIDENT_TYPES } from "@/models/Incident";

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

// ---------------------------------------------------------------------------
// Incidents and SOS
// ---------------------------------------------------------------------------

export const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_ADDRESS_LENGTH = 300;
const MAX_SOS_MESSAGE_LENGTH = 500;

export const UPDATABLE_STATUSES = ["in_progress", "resolved"];

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const DEFAULT_RADIUS_KM = 10;
const MAX_RADIUS_KM = 100;
const EARTH_RADIUS_KM = 6378.1;
const WHOLE_NUMBER = /^\d+$/;
const DECIMAL_NUMBER = /^-?\d+(\.\d+)?$/;
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

export function isObjectIdString(value) {
  return typeof value === "string" && OBJECT_ID.test(value);
}

// Trims, then caps the length. Never leaves half of an emoji at the cut.
function capText(value, max) {
  let text = value.trim();
  if (text.length > max) {
    text = text.slice(0, max);
    if (/[\uD800-\uDBFF]$/.test(text)) text = text.slice(0, -1);
  }
  return text;
}

// Reads an optional text field. Returns { value } (undefined when absent or
// blank) or { error } when it is present but not a string.
function readOptionalText(value, label, max) {
  if (value == null) return { value: undefined };
  if (typeof value !== "string") return { error: `${label} must be text` };
  return { value: capText(value, max) || undefined };
}

// API bodies carry a location as { lng, lat }; the database stores GeoJSON.
function parseLocation(location) {
  if (location == null) return { error: 'Location is required: { "lng": number, "lat": number }' };
  if (typeof location !== "object" || Array.isArray(location)) {
    return { error: 'Location must be an object like { "lng": number, "lat": number }' };
  }
  const { lng, lat } = location;
  if (!isLngLat([lng, lat])) {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return { error: "Location lng and lat must be numbers" };
    if (Math.abs(lng) > 180) return { error: "Location lng must be between -180 and 180" };
    return { error: "Location lat must be between -90 and 90" };
  }
  return { value: { type: "Point", coordinates: [lng, lat] } };
}

// POST /api/incidents body -> { errors, data }. Only whitelisted fields are
// read, so a body can't set status or reportedBy.
export function validateIncidentInput(body) {
  const errors = {};
  const data = {};

  if (body.type == null) errors.type = `Type is required (one of: ${INCIDENT_TYPES.join(", ")})`;
  else if (!INCIDENT_TYPES.includes(body.type)) errors.type = `Type must be one of: ${INCIDENT_TYPES.join(", ")}`;
  else data.type = body.type;

  if (typeof body.description !== "string" || body.description.trim() === "") {
    errors.description = "Description is required";
  } else {
    data.description = capText(body.description, MAX_DESCRIPTION_LENGTH);
  }

  const location = parseLocation(body.location);
  if (location.error) errors.location = location.error;
  else data.location = location.value;

  const address = readOptionalText(body.address, "Address", MAX_ADDRESS_LENGTH);
  if (address.error) errors.address = address.error;
  else if (address.value) data.address = address.value;

  if (body.severity != null) {
    if (INCIDENT_SEVERITIES.includes(body.severity)) data.severity = body.severity;
    else errors.severity = `Severity must be one of: ${INCIDENT_SEVERITIES.join(", ")}`;
  }

  return { errors, data };
}

// POST /api/sos body -> { errors, data }.
export function validateSosInput(body) {
  const errors = {};
  const data = {};

  const location = parseLocation(body.location);
  if (location.error) errors.location = location.error;
  else data.location = location.value;

  const message = readOptionalText(body.message, "Message", MAX_SOS_MESSAGE_LENGTH);
  if (message.error) errors.message = message.error;
  else data.message = message.value;

  return { errors, data };
}

// GET /api/incidents query string -> { errors, filter, limit }.
// Enum filters must be exact values. limit and radiusKm are clamped to their
// maximums but must otherwise be sensible numbers.
export function parseIncidentQuery(params) {
  const errors = {};
  const filter = {};

  for (const [name, allowed] of [
    ["status", INCIDENT_STATUSES],
    ["type", INCIDENT_TYPES],
    ["severity", INCIDENT_SEVERITIES],
  ]) {
    const value = params.get(name);
    if (value === null) continue;
    if (allowed.includes(value)) filter[name] = value;
    else errors[name] = `${name} must be one of: ${allowed.join(", ")}`;
  }

  let limit = DEFAULT_LIMIT;
  const rawLimit = params.get("limit");
  if (rawLimit !== null) {
    if (!WHOLE_NUMBER.test(rawLimit) || Number(rawLimit) < 1) {
      errors.limit = `limit must be a whole number from 1 to ${MAX_LIMIT}`;
    } else {
      limit = Math.min(Number(rawLimit), MAX_LIMIT);
    }
  }

  const rawNear = params.get("near");
  const rawRadius = params.get("radiusKm");
  if (rawNear === null) {
    if (rawRadius !== null) errors.radiusKm = "radiusKm can only be used together with near=lng,lat";
  } else {
    const parts = rawNear.split(",").map((part) => (DECIMAL_NUMBER.test(part.trim()) ? Number(part) : NaN));
    const [lng, lat] = parts;
    if (parts.length !== 2 || !isLngLat([lng, lat])) {
      errors.near = "near must be lng,lat, for example near=77.209,28.6139 (lng -180..180, lat -90..90)";
    }

    let radiusKm = DEFAULT_RADIUS_KM;
    if (rawRadius !== null) {
      if (!DECIMAL_NUMBER.test(rawRadius) || Number(rawRadius) <= 0) {
        errors.radiusKm = `radiusKm must be a number greater than 0 (max ${MAX_RADIUS_KM})`;
      } else {
        radiusKm = Math.min(Number(rawRadius), MAX_RADIUS_KM);
      }
    }

    if (!errors.near && !errors.radiusKm) {
      filter.location = { $geoWithin: { $centerSphere: [[lng, lat], radiusKm / EARTH_RADIUS_KM] } };
    }
  }

  return { errors, filter, limit };
}

// PATCH /api/incidents/[id] body -> { error } or { status }. Only `status` may be sent.
export function validateStatusUpdate(body) {
  const extra = Object.keys(body).filter((key) => key !== "status");
  if (extra.length > 0) return { error: `Only status can be updated (not: ${extra.join(", ")})` };
  if (!UPDATABLE_STATUSES.includes(body.status)) {
    return { error: `Status must be one of: ${UPDATABLE_STATUSES.join(", ")}` };
  }
  return { status: body.status };
}
