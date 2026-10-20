import { getCurrentUser } from "@/lib/auth";
import connectDB from "@/lib/db";
import { errorResponse, readJsonBody } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";
import { validateSosInput } from "@/lib/validation";
import Incident from "@/models/Incident";

// An SOS is just a critical incident with a fixed shape, so responders see it
// in the same list. Anonymous alerts are allowed.
export async function POST(request) {
  const limited = rateLimit(request, "sos");
  if (limited) return limited;

  const body = await readJsonBody(request);
  if (!body) return errorResponse(400, "Request body must be a JSON object");

  const { errors, data } = validateSosInput(body);
  const messages = Object.values(errors);
  if (messages.length > 0) return errorResponse(400, messages[0], { errors });

  const user = await getCurrentUser();

  await connectDB();
  const incident = await Incident.create({
    type: "other",
    severity: "critical",
    status: "reported",
    description: data.message ? `SOS alert: ${data.message}` : "SOS alert",
    location: data.location,
    reportedBy: user?._id,
  });
  return Response.json({ id: incident._id }, { status: 201 });
}
