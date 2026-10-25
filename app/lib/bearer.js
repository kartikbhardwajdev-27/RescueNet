// Reads the login token out of an `Authorization` request header. Pure, so it is
// checked on its own (scripts/check-mobile.mjs) and used by lib/auth.js.

const BEARER_PREFIX = /^Bearer[ \t]/i;
// A JWT is three base64url parts. The size cap keeps a giant header from being
// matched, let alone verified.
const BEARER_TOKEN = /^Bearer[ \t]+([A-Za-z0-9_-]{1,2048}\.[A-Za-z0-9_-]{1,2048}\.[A-Za-z0-9_-]{1,2048})$/i;

// The token inside an `Authorization: Bearer <jwt>` header value:
//   undefined  not a bearer header at all (none, or Basic and so on): not ours,
//              the caller should carry on with the cookie
//   null       a bearer header whose token is not even shaped like a JWT
//   string     the token (still to be verified by verifyToken)
export function bearerTokenFrom(authorization) {
  if (typeof authorization !== "string" || !BEARER_PREFIX.test(authorization)) return undefined;
  return BEARER_TOKEN.exec(authorization.trim())?.[1] ?? null;
}
