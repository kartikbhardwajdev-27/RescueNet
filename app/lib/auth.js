import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { cookies, headers } from "next/headers";
import { bearerTokenFrom } from "@/lib/bearer";
import connectDB from "@/lib/db";
import User from "@/models/User";

export const AUTH_COOKIE = "rescuenet_token";
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

const MIN_SECRET_LENGTH = 32;

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === "change_me") {
    throw new Error('JWT_SECRET is missing or still "change_me". Set a real value in .env.local (openssl rand -hex 32).');
  }
  // A short secret can be guessed offline from a single login cookie.
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET is too short (${secret.length} characters; at least ${MIN_SECRET_LENGTH}). Use: openssl rand -hex 32`);
  }
  return secret;
}

// Call at the top of a handler that writes data, so a misconfigured server
// fails before it creates anything.
export function assertAuthConfigured() {
  getSecret();
}

export function signToken(user) {
  return jwt.sign({ id: user._id.toString(), role: user.role }, getSecret(), {
    algorithm: "HS256",
    expiresIn: TOKEN_TTL_SECONDS,
  });
}

// Returns the payload, or null if the token is invalid or expired.
export function verifyToken(token) {
  const secret = getSecret();
  try {
    return jwt.verify(token, secret, { algorithms: ["HS256"] });
  } catch {
    return null;
  }
}

// Was this request made over https? A "Secure" cookie is dropped by the browser
// when it arrives over plain http, and RescueNet is meant to run on a laptop
// that phones reach at http://<laptop-ip>: with a Secure cookie nobody could stay
// logged in there (register and login appeared to work, then the next request was
// anonymous). So the cookie is Secure only when the request really was https:
// the last x-forwarded-proto entry is the one a reverse proxy in front adds, and
// COOKIE_SECURE=true forces it for a deployment whose proxy does not send it.
async function cookieShouldBeSecure() {
  if (process.env.COOKIE_SECURE === "true") return true;
  const forwarded = (await headers()).get("x-forwarded-proto");
  return forwarded?.split(",").at(-1).trim().toLowerCase() === "https";
}

export async function setAuthCookie(user) {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE, signToken(user), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: TOKEN_TTL_SECONDS,
    secure: await cookieShouldBeSecure(),
  });
}

export async function clearAuthCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE);
}

// Sign-in for a client that cannot keep our cookie: the Android app, whose pages
// are not served from this origin. It asks for a token with { returnToken: true }
// in the login or register body, gets the same JWT the cookie would have held in
// the response, and sends it back as `Authorization: Bearer <jwt>`. No cookie is
// set for such a client. The website never asks, so for it nothing changes.
export function wantsToken(body) {
  return body.returnToken === true;
}

export function tokenResponse(user, status = 200) {
  return Response.json({ ...user.toJSON(), token: signToken(user) }, { status, headers: { "Cache-Control": "no-store" } });
}

// The JWT this request carries: the bearer token if there is a bearer header,
// otherwise the login cookie, otherwise null. An invalid bearer token is not
// "rescued" by a cookie: the request is anonymous.
//
// The bearer path adds no cross-site risk: a browser never attaches this header
// by itself, so a page on another site cannot make a request that carries it, and
// proxy.js still refuses cross-site writes whether or not the header is present.
// cookies() is awaited first on purpose: it opts the caller out of build-time
// prerendering, so a build without JWT_SECRET never reaches the secret check.
async function readToken() {
  const cookieStore = await cookies();
  const bearer = bearerTokenFrom((await headers()).get("authorization"));
  if (bearer !== undefined) return bearer;
  return cookieStore.get(AUTH_COOKIE)?.value ?? null;
}

// The id of the person whose login cookie this request carries, or null. Checks
// the signature and expiry but does not read the database, so it is cheap enough
// for public lists that only need to know "is this one mine?".
export async function getSessionUserId() {
  const token = await readToken();
  getSecret();
  if (!token) return null;
  const payload = verifyToken(token);
  return payload && typeof payload.id === "string" && mongoose.isValidObjectId(payload.id) ? payload.id : null;
}

// The logged-in user (without passwordHash), or null. Read-only, so it is safe
// to call from route handlers and Server Components alike.
export async function getCurrentUser() {
  // readToken() calls cookies() first: it opts the caller out of build-time
  // prerendering, so a build without JWT_SECRET never reaches the check below.
  const token = await readToken();
  getSecret();
  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload || typeof payload.id !== "string" || !mongoose.isValidObjectId(payload.id)) return null;

  await connectDB();
  return User.findById(payload.id);
}
