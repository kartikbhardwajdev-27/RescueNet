import { getCurrentUser, getSessionUserId } from "@/lib/auth";
import connectDB from "@/lib/db";
import ensureIndexes from "@/lib/ensureIndexes";
import { badBody, errorResponse, readJsonBody } from "@/lib/http";
import { REPLAY_HEADERS, clientIdFor, isDuplicateKeyError, readIdempotencyKey } from "@/lib/idempotency";
import { toPublicIncident } from "@/lib/publicView";
import { rateLimit } from "@/lib/rateLimit";
import { PRIORITY_SEVERITY_WEIGHT, SOS_PRIORITY_BONUS, scoreDescription } from "@/lib/triage";
import { parseIncidentQuery, validateIncidentInput } from "@/lib/validation";
import Incident from "@/models/Incident";

// What a sender gets back and what a list shows depends on who is asking
// (`isMine`), so none of it may sit in a shared cache.
const NO_STORE = { "Cache-Control": "no-store" };

const replay = (existing, viewerId) =>
  Response.json(toPublicIncident(existing, viewerId), { status: 200, headers: { ...REPLAY_HEADERS, ...NO_STORE } });

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
    if (existing) return replay(existing, await getSessionUserId());
  }

  const limited = rateLimit(request, "incidents");
  if (limited) return limited;

  const body = await readJsonBody(request);
  if (!body) return badBody(request);

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
      if (existing) return replay(existing, user?._id);
    }
    throw err;
  }
  return Response.json(toPublicIncident(incident, user?._id), { status: 201, headers: NO_STORE });
}

export async function GET(request) {
  const { errors, filter, limit, mine, sort } = parseIncidentQuery(new URL(request.url).searchParams);
  const messages = Object.values(errors);
  if (messages.length > 0) return errorResponse(400, messages[0], { errors });

  // mine=true: only the logged-in person's own reports. Matched on the id from
  // their session cookie, so nobody can ask for someone else's.
  let viewerId = null;
  if (mine) {
    const user = await getCurrentUser();
    if (!user) return errorResponse(401, "Not authenticated");
    filter.reportedBy = user._id;
    viewerId = user._id;
  } else {
    viewerId = await getSessionUserId();
  }

  await connectDB();
  const incidents =
    sort === "priority"
      ? await Incident.aggregate(priorityPipeline(filter, limit))
      : // _id breaks ties so equal timestamps keep a stable order.
        await Incident.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit).lean();
  return Response.json(
    incidents.map((incident) => toPublicIncident(incident, viewerId)),
    { headers: NO_STORE },
  );
}
