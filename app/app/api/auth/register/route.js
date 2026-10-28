import bcrypt from "bcryptjs";
import { assertAuthConfigured, setAuthCookie, tokenResponse, wantsToken } from "@/lib/auth";
import connectDB from "@/lib/db";
import { badBody, errorResponse, readJsonBody } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";
import { validateRegistration } from "@/lib/validation";
import User from "@/models/User";

const BCRYPT_COST = 10;

export async function POST(request) {
  const limited = await rateLimit(request, "register");
  if (limited) return limited;

  // Fail before touching the database if the server can't issue tokens.
  assertAuthConfigured();

  const body = await readJsonBody(request);
  if (!body) return badBody(request);

  const { errors, data } = validateRegistration(body);
  const messages = Object.values(errors);
  if (messages.length > 0) return errorResponse(400, messages[0], { errors });

  await connectDB();

  if (await User.exists({ email: data.email })) {
    return errorResponse(409, "Email already registered");
  }

  const passwordHash = await bcrypt.hash(body.password, BCRYPT_COST);

  let user;
  try {
    user = await User.create({ ...data, passwordHash });
  } catch (err) {
    // Two requests can pass the check above together; the unique index decides.
    if (err?.code === 11000) return errorResponse(409, "Email already registered");
    if (err?.name === "ValidationError") {
      const fields = Object.fromEntries(Object.entries(err.errors).map(([path, e]) => [path, e.message]));
      return errorResponse(400, Object.values(fields)[0], { errors: fields });
    }
    throw err;
  }

  if (wantsToken(body)) return tokenResponse(user, 201);
  await setAuthCookie(user);
  return Response.json(user, { status: 201 });
}
