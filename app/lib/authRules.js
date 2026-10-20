// Rules shared by the server (lib/validation.js, models/User.js) and the browser
// forms, so the two can't drift apart. Keep this file pure and dependency-free:
// it is imported on both sides.

export const USER_ROLES = ["citizen", "organization"];
export const ORG_TYPES = ["NGO", "govt", "volunteer group"];

export const PASSWORD_MIN_LENGTH = 8;
// bcrypt silently ignores everything past 72 bytes, so longer passwords are rejected.
export const PASSWORD_MAX_BYTES = 72;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

export function isValidEmail(email) {
  return email.length <= 254 && EMAIL_PATTERN.test(email);
}

export function isPasswordTooLong(password) {
  return new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES;
}
