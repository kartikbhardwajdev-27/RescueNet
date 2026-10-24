import { getCurrentUser, getSessionUserId } from "@/lib/auth";
import connectDB from "@/lib/db";
import { badBody, errorResponse, readJsonBody } from "@/lib/http";
import { toPublicIncident } from "@/lib/publicView";
import { rateLimit } from "@/lib/rateLimit";
import { isObjectIdString, validateStatusUpdate } from "@/lib/validation";
import Incident from "@/models/Incident";

// What is shown depends on who is asking (isMine), so it must not be cached and shared.
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(_request, { params }) {
  const { id } = await params;
  if (!isObjectIdString(id)) return errorResponse(400, "Invalid incident id");

  await connectDB();
  const incident = await Incident.findById(id);
  if (!incident) return errorResponse(404, "Incident not found");
  return Response.json(toPublicIncident(incident, await getSessionUserId()), { headers: NO_STORE });
}

// Only organizations may change an incident's status, and status is the only
// field they may change.
export async function PATCH(request, { params }) {
  const limited = rateLimit(request, "updates");
  if (limited) return limited;

  const user = await getCurrentUser();
  if (!user) return errorResponse(401, "Not authenticated");
  if (user.role !== "organization") {
    return errorResponse(403, "Only organizations can update incident status");
  }

  const { id } = await params;
  if (!isObjectIdString(id)) return errorResponse(400, "Invalid incident id");

  const body = await readJsonBody(request);
  if (!body) return badBody(request);

  const { error, status } = validateStatusUpdate(body);
  if (error) return errorResponse(400, error);

  await connectDB();
  const incident = await Incident.findByIdAndUpdate(id, { status }, { new: true, runValidators: true });
  if (!incident) return errorResponse(404, "Incident not found");
  return Response.json(toPublicIncident(incident, user._id), { headers: NO_STORE });
}
