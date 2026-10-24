import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { cookies, headers } from "next/headers";
import connectDB from "@/lib/db";
import User from "@/models/User";

export const AUTH_COOKIE = "rescuenet_token";
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === "change_me") {
    throw new Error('JWT_SECRET is missing or still "change_me". Set a real value in .env.local (openssl rand -hex 32).');
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

// The logged-in user (without passwordHash), or null. Read-only, so it is safe
// to call from route handlers and Server Components alike.
export async function getCurrentUser() {
  // cookies() first: it opts the caller out of build-time prerendering, so a
  // build without JWT_SECRET never reaches the check below.
  const cookieStore = await cookies();
  getSecret();

  const token = cookieStore.get(AUTH_COOKIE)?.value;
  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload || typeof payload.id !== "string" || !mongoose.isValidObjectId(payload.id)) return null;

  await connectDB();
  return User.findById(payload.id);
}
