import { getCurrentUser } from "@/lib/auth";
import connectDB from "@/lib/db";
import ensureIndexes from "@/lib/ensureIndexes";
import { errorResponse, readJsonBody } from "@/lib/http";
import { REPLAY_HEADERS, clientIdFor, isDuplicateKeyError, readIdempotencyKey } from "@/lib/idempotency";
import { rateLimit } from "@/lib/rateLimit";
import { PRIORITY_SEVERITY_WEIGHT, SOS_PRIORITY_BONUS, scoreDescription } from "@/lib/triage";
import { parseIncidentQuery, validateIncidentInput } from "@/lib/validation";
import Incident from "@/models/Incident";

const replay = (existing) => Response.json(existing, { status: 200, headers: REPLAY_HEADERS });

// sort=priority, worked out inside MongoDB so the limit applies after sorting.
// The same sum as priorityOf() in lib/triage.js: the reporter's severity, plus
// the stored keyword score (0 on older incidents), plus a bonus for an SOS
// alert. Resolved incidents go last. An aggregation skips the schema, so the
// private clientId is removed by hand.
function priorityPipeline(filter, limit) {
  return [
    { $match: filter },
    {
      $addFields: {
        _open: { $cond: [{ $eq: ["$status", "resolved"] }, 0, 1] },
        _priority: {
          $add: [
            { $switch: { branches: Object.entries(PRIORITY_SEVERITY_WEIGHT).map(([severity, weight]) => ({ case: { $eq: ["$severity", severity] }, then: weight })), default: 0 } },
            { $ifNull: ["$triage.score", 0] },
            { $cond: [{ $eq: ["$isSos", true] }, SOS_PRIORITY_BONUS, 0] },
          ],
        },
      },
    },
    { $sort: { _open: -1, _priority: -1, createdAt: -1, _id: -1 } },
    { $limit: limit },
    { $project: { _open: 0, _priority: 0, clientId: 0 } },
  ];
}

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
    // triage is worked out here from the description, never read from the request.
    const { score, reasons } = scoreDescription(data.description);
    incident = await Incident.create({ ...data, isSos: false, triage: { score, reasons }, reportedBy: user?._id, clientId });
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
  const { errors, filter, limit, mine, sort } = parseIncidentQuery(new URL(request.url).searchParams);
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
  const incidents =
    sort === "priority"
      ? await Incident.aggregate(priorityPipeline(filter, limit))
      : // _id breaks ties so equal timestamps keep a stable order.
        await Incident.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit).lean();
  // A person's own list is personal: keep it out of any shared cache.
  return Response.json(incidents, mine ? { headers: { "Cache-Control": "no-store" } } : undefined);
}
