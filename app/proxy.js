import { NextResponse } from "next/server";

// Runs before every /api request (see `matcher`). Two cheap refusals that apply
// to every route at once:
//
// 1. Cross-site writes. Login cookies are SameSite=Lax, which already keeps a
//    browser from sending them on another site's POST. This is the second wall:
//    a request that changes anything and says it came from a different origin
//    (an `Origin` header that is not this server, or the browser's own
//    `Sec-Fetch-Site: cross-site`) is refused. curl, scripts and the app itself
//    send no foreign Origin and pass.
// 2. Oversized bodies, by Content-Length, before anything is read. The route
//    handlers also count the bytes themselves (readJsonBody in lib/http.js),
//    which covers a missing or false Content-Length.

const MAX_BODY_BYTES = 32 * 1024; // keep equal to MAX_BODY_BYTES in lib/http.js
const READ_ONLY = new Set(["GET", "HEAD", "OPTIONS"]);

const refuse = (status, error) => NextResponse.json({ error }, { status });

export function proxy(request) {
  if (READ_ONLY.has(request.method)) return NextResponse.next();

  if (request.headers.get("sec-fetch-site") === "cross-site") return refuse(403, "Cross-site request refused");

  const origin = request.headers.get("origin");
  if (origin !== null) {
    let originHost = null;
    try {
      originHost = new URL(origin).host; // "null" (a sandboxed page) is not a URL: refused below
    } catch {}
    const ownHosts = [request.headers.get("host"), request.headers.get("x-forwarded-host")];
    if (originHost === null || !ownHosts.includes(originHost)) return refuse(403, "Cross-site request refused");
  }

  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) return refuse(413, "Request body is too large");

  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
