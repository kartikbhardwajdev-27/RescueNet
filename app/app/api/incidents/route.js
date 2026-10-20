import { getCurrentUser } from "@/lib/auth";
import connectDB from "@/lib/db";
import { errorResponse, readJsonBody } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";
import { parseIncidentQuery, validateIncidentInput } from "@/lib/validation";
import Incident from "@/models/Incident";

export async function POST(request) {
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
  const incident = await Incident.create({ ...data, reportedBy: user?._id });
  return Response.json(incident, { status: 201 });
}

export async function GET(request) {
  const { errors, filter, limit } = parseIncidentQuery(new URL(request.url).searchParams);
  const messages = Object.values(errors);
  if (messages.length > 0) return errorResponse(400, messages[0], { errors });

  await connectDB();
  // _id breaks ties so equal timestamps keep a stable order.
  const incidents = await Incident.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit).lean();
  return Response.json(incidents);
}
