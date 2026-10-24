import { getCurrentUser } from "@/lib/auth";
import connectDB from "@/lib/db";
import ensureIndexes from "@/lib/ensureIndexes";
import { errorResponse, readJsonBody } from "@/lib/http";
import { REPLAY_HEADERS, clientIdFor, isDuplicateKeyError, readIdempotencyKey } from "@/lib/idempotency";
import { rateLimit } from "@/lib/rateLimit";
import { validateSosInput } from "@/lib/validation";
import Incident from "@/models/Incident";

const replay = (existing) => Response.json({ id: existing._id }, { status: 200, headers: REPLAY_HEADERS });

// An SOS is just a critical incident with a fixed shape, so responders see it
// in the same list. Anonymous alerts are allowed.
//
// With an Idempotency-Key header (sent by the offline queue) a repeat of the
// same SOS returns the first one's id with status 200 instead of creating a
// second alert. See lib/idempotency.js.
export async function POST(request) {
  const idem = readIdempotencyKey(request);
  if (idem.error) return errorResponse(400, idem.error);
  const clientId = idem.key ? clientIdFor("sos", idem.key) : undefined;

  if (clientId) {
    // A retry of something already saved is answered before the rate limit: the
    // first request was already counted, and the sender must be able to learn
    // that it went through.
    await connectDB();
    await ensureIndexes(Incident);
    const existing = await Incident.findOne({ clientId }).select("_id").lean();
    if (existing) return replay(existing);
  }

  const limited = rateLimit(request, "sos");
  if (limited) return limited;

  const body = await readJsonBody(request);
  if (!body) return errorResponse(400, "Request body must be a JSON object");

  const { errors, data } = validateSosInput(body);
  const messages = Object.values(errors);
  if (messages.length > 0) return errorResponse(400, messages[0], { errors });

  const user = await getCurrentUser();

  await connectDB();
  let incident;
  try {
    incident = await Incident.create({
      type: "other",
      severity: "critical",
      status: "reported",
      isSos: true,
      description: data.message ? `SOS alert: ${data.message}` : "SOS alert",
      location: data.location,
      capturedAt: data.capturedAt,
      reportedBy: user?._id,
      clientId,
    });
  } catch (err) {
    // Two copies of the same request raced; the unique index let one through.
    if (clientId && isDuplicateKeyError(err)) {
      const existing = await Incident.findOne({ clientId }).select("_id").lean();
      if (existing) return replay(existing);
    }
    throw err;
  }
  return Response.json({ id: incident._id }, { status: 201 });
}
