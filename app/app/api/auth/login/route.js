import bcrypt from "bcryptjs";
import { assertAuthConfigured, setAuthCookie } from "@/lib/auth";
import connectDB from "@/lib/db";
import { badBody, errorResponse, readJsonBody } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";
import { isPasswordTooLong, normalizeEmail } from "@/lib/validation";
import User from "@/models/User";

const INVALID_CREDENTIALS = "Invalid email or password";

// Compared against when the email isn't registered, so a wrong email takes as
// long as a wrong password and response time doesn't reveal which emails exist.
let dummyHash;
async function getDummyHash() {
  dummyHash ??= await bcrypt.hash("rescuenet-dummy-password", 10);
  return dummyHash;
}

export async function POST(request) {
  const limited = rateLimit(request, "login");
  if (limited) return limited;

  assertAuthConfigured();

  const body = await readJsonBody(request);
  if (!body) return badBody(request);
  if (
    typeof body.email !== "string" ||
    typeof body.password !== "string" ||
    body.email.trim() === "" ||
    body.password === ""
  ) {
    return errorResponse(400, "Email and password are required");
  }

  // The per-address limit above can be dodged by a client that lies about its
  // address, so guesses against one account are also counted by email.
  const email = normalizeEmail(body.email);
  const limitedAccount = rateLimit(request, "loginAccount", { key: email.slice(0, 254) });
  if (limitedAccount) return limitedAccount;

  await connectDB();

  const user = await User.findOne({ email }).select("+passwordHash");
  const hash = user?.passwordHash ?? (await getDummyHash());
  // Registration caps passwords at 72 bytes, so a longer one can never match.
  const matches = !isPasswordTooLong(body.password) && (await bcrypt.compare(body.password, hash));

  if (!user || !matches) return errorResponse(401, INVALID_CREDENTIALS);

  await setAuthCookie(user);
  return Response.json(user);
}
