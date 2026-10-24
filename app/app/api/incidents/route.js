import { getCurrentUser } from "@/lib/auth";
import connectDB from "@/lib/db";
import ensureIndexes from "@/lib/ensureIndexes";
import { errorResponse, readJsonBody } from "@/lib/http";
import { REPLAY_HEADERS, clientIdFor, isDuplicateKeyError, readIdempotencyKey } from "@/lib/idempotency";
import { rateLimit } from "@/lib/rateLimit";
import { parseIncidentQuery, validateIncidentInput } from "@/lib/validation";
import Incident from "@/models/Incident";

const replay = (existing) => Response.json(existing, { status: 200, headers: REPLAY_HEADERS });

// With an Idempotency-Key header (sent by the offline queue) a repeat of the
// same report returns the first one with status 200 instead of creating a
// duplicate. See lib/idempotency.js.
export async function POST(request) {
  const idem = readIdempotencyKey(request);
  if (idem.error) return errorResponse(400, idem.error);
  const clientId = idem.key ? clientIdFor("incident", idem.key) : undefined;

  if (clientId) {
    // Answered before the rate limit: the first request was already counted,
    // and the sender must be able to learn that it went through.
    await connectDB();
    await ensureIndexes(Incident);
    const existing = await Incident.findOne({ clientId }).lean();
    if (existing) return replay(existing);
  }

  const limited = rateLimit(request, "incidents");
  if (limited) return limited;

  const body = await readJsonBody(request);
  if (!body) return errorResponse(400, "Request body must be a JSON object");

  const { errors, data } = validateIncidentInput(body);
  const messages = Object.values(errors);
  if (messages.length > 0) return errorResponse(400, messages[0], { errors });

  // Anonymous reports are allowed; a valid login cookie attaches the reporter.
  const user = await getCurrentUser();

  await connectDB();
  let incident;
  try {
    // isSos is set here, after the whitelisted data, so a request can never make
    // an ordinary report an SOS.
    incident = await Incident.create({ ...data, isSos: false, reportedBy: user?._id, clientId });
  } catch (err) {
    // Two copies of the same request raced; the unique index let one through.
    if (clientId && isDuplicateKeyError(err)) {
      const existing = await Incident.findOne({ clientId }).lean();
      if (existing) return replay(existing);
    }
    throw err;
  }
  return Response.json(incident, { status: 201 });
}

export async function GET(request) {
  const { errors, filter, limit, mine } = parseIncidentQuery(new URL(request.url).searchParams);
  const messages = Object.values(errors);
  if (messages.length > 0) return errorResponse(400, messages[0], { errors });

  // mine=true: only the logged-in person's own reports. Matched on the id from
  // their session cookie, so nobody can ask for someone else's.
  if (mine) {
    const user = await getCurrentUser();
    if (!user) return errorResponse(401, "Not authenticated");
    filter.reportedBy = user._id;
  }

  await connectDB();
  // _id breaks ties so equal timestamps keep a stable order.
  const incidents = await Incident.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit).lean();
  // A person's own list is personal: keep it out of any shared cache.
  return Response.json(incidents, mine ? { headers: { "Cache-Control": "no-store" } } : undefined);
}
