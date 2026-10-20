import { getCurrentUser } from "@/lib/auth";
import connectDB from "@/lib/db";
import { errorResponse, readJsonBody } from "@/lib/http";
import { isObjectIdString, validateStatusUpdate } from "@/lib/validation";
import Incident from "@/models/Incident";

export async function GET(_request, { params }) {
  const { id } = await params;
  if (!isObjectIdString(id)) return errorResponse(400, "Invalid incident id");

  await connectDB();
  const incident = await Incident.findById(id);
  if (!incident) return errorResponse(404, "Incident not found");
  return Response.json(incident);
}

// Only organizations may change an incident's status, and status is the only
// field they may change.
export async function PATCH(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return errorResponse(401, "Not authenticated");
  if (user.role !== "organization") {
    return errorResponse(403, "Only organizations can update incident status");
  }

  const { id } = await params;
  if (!isObjectIdString(id)) return errorResponse(400, "Invalid incident id");

  const body = await readJsonBody(request);
  if (!body) return errorResponse(400, "Request body must be a JSON object");

  const { error, status } = validateStatusUpdate(body);
  if (error) return errorResponse(400, error);

  await connectDB();
  const incident = await Incident.findByIdAndUpdate(id, { status }, { new: true, runValidators: true });
  if (!incident) return errorResponse(404, "Incident not found");
  return Response.json(incident);
}
