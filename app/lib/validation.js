import {
  ORG_TYPES,
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
  USER_ROLES,
  isPasswordTooLong,
  isValidEmail,
  normalizeEmail,
} from "@/lib/authRules";
import {
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  INCIDENT_TYPES,
  MAX_DESCRIPTION_LENGTH,
  parseCapturedAt,
} from "@/lib/incidentRules";
import {
  MAX_SHELTER_ADDRESS_LENGTH,
  MAX_SHELTER_CAPACITY,
  MAX_SHELTER_NAME_LENGTH,
  PHONE_PATTERN,
  SHELTER_STATUSES,
} from "@/lib/shelterRules";
import {
  EVENT_START_GRACE_MS,
  EVENT_TYPES,
  MAX_EVENT_ADDRESS_LENGTH,
  MAX_EVENT_CAPACITY,
  MAX_EVENT_DESCRIPTION_LENGTH,
  MAX_EVENT_DURATION_MS,
  MAX_EVENT_START_AHEAD_MS,
  MAX_EVENT_TITLE_LENGTH,
} from "@/lib/eventRules";
import { parseIsoDateTime } from "@/lib/isoDate";
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

// ---------------------------------------------------------------------------
// Incidents and SOS
// ---------------------------------------------------------------------------

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

  // Never an error: an unusable capturedAt is just left out (see incidentRules.js).
  const capturedAt = parseCapturedAt(body.capturedAt);
  if (capturedAt) data.capturedAt = capturedAt;

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

  const capturedAt = parseCapturedAt(body.capturedAt);
  if (capturedAt) data.capturedAt = capturedAt;

  return { errors, data };
}

// ---- list query parsing, shared by GET /api/incidents and GET /api/shelters ----
// Enum filters must be exact values. limit and radiusKm are clamped to their
// maximums but must otherwise be sensible numbers.

function readEnumFilters(params, errors, filter, specs) {
  for (const [name, allowed] of specs) {
    const value = params.get(name);
    if (value === null) continue;
    if (allowed.includes(value)) filter[name] = value;
    else errors[name] = `${name} must be one of: ${allowed.join(", ")}`;
  }
}

function readLimit(params, errors) {
  const raw = params.get("limit");
  if (raw === null) return DEFAULT_LIMIT;
  if (!WHOLE_NUMBER.test(raw) || Number(raw) < 1) {
    errors.limit = `limit must be a whole number from 1 to ${MAX_LIMIT}`;
    return DEFAULT_LIMIT;
  }
  return Math.min(Number(raw), MAX_LIMIT);
}

// Reads near=lng,lat and radiusKm. Returns { lng, lat, radiusKm }, or null when
// near is absent or something was invalid (the problem is recorded in `errors`).
function readNear(params, errors) {
  const rawNear = params.get("near");
  const rawRadius = params.get("radiusKm");
  if (rawNear === null) {
    if (rawRadius !== null) errors.radiusKm = "radiusKm can only be used together with near=lng,lat";
    return null;
  }

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

  return errors.near || errors.radiusKm ? null : { lng, lat, radiusKm };
}

// GET /api/incidents query string -> { errors, filter, limit, mine }. Incidents
// stay newest first, so `near` is a plain "within radius" filter. `mine=true`
// asks for only the logged-in user's own reports; the route turns that into a
// filter on the session's user id (never on anything in the query string).
export function parseIncidentQuery(params) {
  const errors = {};
  const filter = {};

  let mine = false;
  const rawMine = params.get("mine");
  if (rawMine === "true") mine = true;
  else if (rawMine !== null && rawMine !== "false") errors.mine = "mine must be true or false";

  readEnumFilters(params, errors, filter, [
    ["status", INCIDENT_STATUSES],
    ["type", INCIDENT_TYPES],
    ["severity", INCIDENT_SEVERITIES],
  ]);
  const limit = readLimit(params, errors);
  const near = readNear(params, errors);
  if (near) {
    filter.location = { $geoWithin: { $centerSphere: [[near.lng, near.lat], near.radiusKm / EARTH_RADIUS_KM] } };
  }

  return { errors, filter, limit, mine };
}

// GET /api/shelters query string -> { errors, filter, limit, nearest }.
// With `near`, results come back nearest first ($near sorts by distance), so
// the caller must not add its own sort; `nearest` says which case this is.
export function parseShelterQuery(params) {
  const errors = {};
  const filter = {};

  readEnumFilters(params, errors, filter, [["status", SHELTER_STATUSES]]);
  const limit = readLimit(params, errors);
  const near = readNear(params, errors);
  if (near) {
    filter.location = {
      $near: { $geometry: { type: "Point", coordinates: [near.lng, near.lat] }, $maxDistance: near.radiusKm * 1000 },
    };
  }

  return { errors, filter, limit, nearest: Boolean(near) };
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

// ---------------------------------------------------------------------------
// Shelters
// ---------------------------------------------------------------------------

const UPDATABLE_SHELTER_FIELDS = ["occupied", "capacity", "status"];

const isWholeNumber = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

// POST /api/shelters body -> { errors, data }. Only whitelisted fields are read,
// so a body can't set createdBy or seeded.
export function validateShelterInput(body) {
  const errors = {};
  const data = {};

  if (typeof body.name !== "string" || body.name.trim() === "") {
    errors.name = "Name is required";
  } else if (body.name.trim().length > MAX_SHELTER_NAME_LENGTH) {
    errors.name = `Name must be at most ${MAX_SHELTER_NAME_LENGTH} characters`;
  } else {
    data.name = body.name.trim();
  }

  if (typeof body.address !== "string" || body.address.trim() === "") {
    errors.address = "Address is required";
  } else if (body.address.trim().length > MAX_SHELTER_ADDRESS_LENGTH) {
    errors.address = `Address must be at most ${MAX_SHELTER_ADDRESS_LENGTH} characters`;
  } else {
    data.address = body.address.trim();
  }

  const location = parseLocation(body.location);
  if (location.error) errors.location = location.error;
  else data.location = location.value;

  if (!isWholeNumber(body.capacity, 1, MAX_SHELTER_CAPACITY)) {
    errors.capacity = `Capacity must be a whole number from 1 to ${MAX_SHELTER_CAPACITY}`;
  } else {
    data.capacity = body.capacity;
  }

  if (body.occupied != null) {
    if (!isWholeNumber(body.occupied, 0, MAX_SHELTER_CAPACITY)) {
      errors.occupied = "Occupied must be a whole number, 0 or more";
    } else if (data.capacity !== undefined && body.occupied > data.capacity) {
      errors.occupied = "Occupied cannot exceed capacity";
    } else {
      data.occupied = body.occupied;
    }
  }

  if (body.status != null) {
    if (SHELTER_STATUSES.includes(body.status)) data.status = body.status;
    else errors.status = `Status must be one of: ${SHELTER_STATUSES.join(", ")}`;
  }

  const phone = readOptionalText(body.contactPhone, "Contact phone", 30);
  if (phone.error) errors.contactPhone = phone.error;
  else if (phone.value !== undefined) {
    if (PHONE_PATTERN.test(phone.value)) data.contactPhone = phone.value;
    else errors.contactPhone = "Contact phone must be 5 to 30 characters: digits, spaces and + - ( ) .";
  }

  return { errors, data };
}

// PATCH /api/shelters/[id] body -> { errors, updates }. Only occupied, capacity
// and status may be sent; checks that involve the stored shelter (occupied vs
// capacity) are left to the route.
export function validateShelterUpdate(body) {
  const errors = {};
  const updates = {};

  const extra = Object.keys(body).filter((key) => !UPDATABLE_SHELTER_FIELDS.includes(key));
  if (extra.length > 0) {
    errors.body = `Only ${UPDATABLE_SHELTER_FIELDS.join(", ")} can be updated (not: ${extra.join(", ")})`;
    return { errors, updates };
  }
  if (!UPDATABLE_SHELTER_FIELDS.some((key) => body[key] !== undefined)) {
    errors.body = `Send at least one of: ${UPDATABLE_SHELTER_FIELDS.join(", ")}`;
    return { errors, updates };
  }

  if (body.capacity !== undefined) {
    if (isWholeNumber(body.capacity, 1, MAX_SHELTER_CAPACITY)) updates.capacity = body.capacity;
    else errors.capacity = `Capacity must be a whole number from 1 to ${MAX_SHELTER_CAPACITY}`;
  }
  if (body.occupied !== undefined) {
    if (isWholeNumber(body.occupied, 0, MAX_SHELTER_CAPACITY)) updates.occupied = body.occupied;
    else errors.occupied = "Occupied must be a whole number, 0 or more";
  }
  if (body.status !== undefined) {
    if (SHELTER_STATUSES.includes(body.status)) updates.status = body.status;
    else errors.status = `Status must be one of: ${SHELTER_STATUSES.join(", ")}`;
  }

  return { errors, updates };
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

const UPDATABLE_EVENT_FIELDS = ["title", "description", "type", "address", "location", "startsAt", "endsAt", "capacity"];
const TIME_HINT = "a real date and time with a time zone, like 2026-11-02T10:00:00Z";

// Required text: present, a string, not blank, not too long. Too long is an
// error rather than a silent cut, because a title is something a person reads.
function readRequiredText(value, label, max) {
  if (typeof value !== "string" || value.trim() === "") return { error: `${label} is required` };
  const text = value.trim();
  if (text.length > max) return { error: `${label} must be at most ${max} characters` };
  return { value: text };
}

// A start time: a real date-time that is not already over (a few minutes of
// grace for a form left open) and not absurdly far ahead.
function readEventStart(value, nowMs) {
  if (value == null) return { error: "Start time is required" };
  const ms = parseIsoDateTime(value);
  if (Number.isNaN(ms)) return { error: `Start time must be ${TIME_HINT}` };
  if (ms < nowMs - EVENT_START_GRACE_MS) return { error: "Start time can't be in the past" };
  if (ms > nowMs + MAX_EVENT_START_AHEAD_MS) return { error: "Start time can't be more than 2 years ahead" };
  return { value: new Date(ms) };
}

function readEventEnd(value, startMs) {
  const ms = parseIsoDateTime(value);
  if (Number.isNaN(ms)) return { error: `End time must be ${TIME_HINT}` };
  if (ms <= startMs) return { error: "End time must be after the start time" };
  if (ms - startMs > MAX_EVENT_DURATION_MS) return { error: "An event can last at most 30 days" };
  return { value: new Date(ms) };
}

const capacityError = `Capacity must be a whole number from 1 to ${MAX_EVENT_CAPACITY}`;

// POST /api/events body -> { errors, data }. Only whitelisted fields are read,
// so a body can't set organizer, attendees or status.
export function validateEventInput(body, nowMs = Date.now()) {
  const errors = {};
  const data = {};

  const title = readRequiredText(body.title, "Title", MAX_EVENT_TITLE_LENGTH);
  if (title.error) errors.title = title.error;
  else data.title = title.value;

  const description = readRequiredText(body.description, "Description", MAX_EVENT_DESCRIPTION_LENGTH);
  if (description.error) errors.description = description.error;
  else data.description = description.value;

  if (body.type == null) errors.type = `Type is required (one of: ${EVENT_TYPES.join(", ")})`;
  else if (!EVENT_TYPES.includes(body.type)) errors.type = `Type must be one of: ${EVENT_TYPES.join(", ")}`;
  else data.type = body.type;

  const address = readRequiredText(body.address, "Address", MAX_EVENT_ADDRESS_LENGTH);
  if (address.error) errors.address = address.error;
  else data.address = address.value;

  const location = parseLocation(body.location);
  if (location.error) errors.location = location.error;
  else data.location = location.value;

  const start = readEventStart(body.startsAt, nowMs);
  if (start.error) errors.startsAt = start.error;
  else data.startsAt = start.value;

  if (body.endsAt != null) {
    if (!data.startsAt) {
      // Without a valid start there is nothing to compare with; say what we can.
      if (Number.isNaN(parseIsoDateTime(body.endsAt))) errors.endsAt = `End time must be ${TIME_HINT}`;
    } else {
      const end = readEventEnd(body.endsAt, data.startsAt.getTime());
      if (end.error) errors.endsAt = end.error;
      else data.endsAt = end.value;
    }
  }

  if (body.capacity != null) {
    if (isWholeNumber(body.capacity, 1, MAX_EVENT_CAPACITY)) data.capacity = body.capacity;
    else errors.capacity = capacityError;
  }

  return { errors, data };
}

// PATCH /api/events/[id] body -> { errors, updates }. `existing` is the stored
// event's { startsAt, endsAt }, needed to check the two times against each other.
// Only the fields in UPDATABLE_EVENT_FIELDS may be sent; `endsAt: null` and
// `capacity: null` remove the end time / the limit (they come back as null in
// `updates`). Checks that need the attendee list (capacity vs people already
// joined) are left to the route, which does them atomically.
export function validateEventUpdate(body, existing, nowMs = Date.now()) {
  const errors = {};
  const updates = {};

  const extra = Object.keys(body).filter((key) => !UPDATABLE_EVENT_FIELDS.includes(key));
  if (extra.length > 0) {
    errors.body = `Only ${UPDATABLE_EVENT_FIELDS.join(", ")} can be updated (not: ${extra.join(", ")})`;
    return { errors, updates };
  }
  if (!UPDATABLE_EVENT_FIELDS.some((key) => body[key] !== undefined)) {
    errors.body = `Send at least one of: ${UPDATABLE_EVENT_FIELDS.join(", ")}`;
    return { errors, updates };
  }

  for (const [key, label, max] of [
    ["title", "Title", MAX_EVENT_TITLE_LENGTH],
    ["description", "Description", MAX_EVENT_DESCRIPTION_LENGTH],
    ["address", "Address", MAX_EVENT_ADDRESS_LENGTH],
  ]) {
    if (body[key] === undefined) continue;
    const text = readRequiredText(body[key], label, max);
    if (text.error) errors[key] = text.error;
    else updates[key] = text.value;
  }

  if (body.type !== undefined) {
    if (EVENT_TYPES.includes(body.type)) updates.type = body.type;
    else errors.type = `Type must be one of: ${EVENT_TYPES.join(", ")}`;
  }

  if (body.location !== undefined) {
    const location = parseLocation(body.location);
    if (location.error) errors.location = location.error;
    else updates.location = location.value;
  }

  if (body.startsAt !== undefined) {
    const start = readEventStart(body.startsAt, nowMs);
    if (start.error) errors.startsAt = start.error;
    else updates.startsAt = start.value;
  }

  // The end is judged against the start the event will have after this update.
  const startMs = (updates.startsAt ?? new Date(existing.startsAt)).getTime();
  if (body.endsAt === null) {
    updates.endsAt = null;
  } else if (body.endsAt !== undefined) {
    const end = readEventEnd(body.endsAt, startMs);
    if (end.error) errors.endsAt = end.error;
    else updates.endsAt = end.value;
  } else if (updates.startsAt && existing.endsAt) {
    // Moving the start must not leave the old end time before it.
    const end = readEventEnd(new Date(existing.endsAt).getTime(), startMs);
    if (end.error) errors.endsAt = `${end.error} (change or remove the end time too)`;
  }

  if (body.capacity === null) updates.capacity = null;
  else if (body.capacity !== undefined) {
    if (isWholeNumber(body.capacity, 1, MAX_EVENT_CAPACITY)) updates.capacity = body.capacity;
    else errors.capacity = capacityError;
  }

  return { errors, updates };
}

// GET /api/events query string -> { errors, filter, limit, when }.
//   type            one event type
//   near=lng,lat    only events within radiusKm (default 10) of that point
//   when            "upcoming" (the default: not over yet), "past" or "all"
// Cancelled events are never in this list (the route adds that); the caller
// builds the time condition from `when`.
export function parseEventQuery(params) {
  const errors = {};
  const filter = {};

  readEnumFilters(params, errors, filter, [["type", EVENT_TYPES]]);
  const limit = readLimit(params, errors);
  const near = readNear(params, errors);
  if (near) {
    filter.location = { $geoWithin: { $centerSphere: [[near.lng, near.lat], near.radiusKm / EARTH_RADIUS_KM] } };
  }

  let when = "upcoming";
  const rawWhen = params.get("when");
  if (rawWhen !== null) {
    if (["upcoming", "past", "all"].includes(rawWhen)) when = rawWhen;
    else errors.when = "when must be one of: upcoming, past, all";
  }

  return { errors, filter, limit, when };
}
