import { getCurrentUser } from "@/lib/auth";
import connectDB from "@/lib/db";
import { errorResponse, readJsonBody } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";
import { parseShelterQuery, validateShelterInput } from "@/lib/validation";
import Shelter from "@/models/Shelter";

// Newest first; with ?near=lng,lat, nearest first (and only within radiusKm).
export async function GET(request) {
  const { errors, filter, limit, nearest } = parseShelterQuery(new URL(request.url).searchParams);
  const messages = Object.values(errors);
  if (messages.length > 0) return errorResponse(400, messages[0], { errors });

  await connectDB();
  let query = Shelter.find(filter);
  // $near already orders by distance and can't be combined with a sort.
  if (!nearest) query = query.sort({ createdAt: -1, _id: -1 });
  const shelters = await query.limit(limit).lean();
  return Response.json(shelters);
}

// Only logged-in organizations may add shelters.
export async function POST(request) {
  const limited = rateLimit(request, "shelters");
  if (limited) return limited;

  const user = await getCurrentUser();
  if (!user) return errorResponse(401, "Not authenticated");
  if (user.role !== "organization") return errorResponse(403, "Only organizations can add shelters");

  const body = await readJsonBody(request);
  if (!body) return errorResponse(400, "Request body must be a JSON object");

  const { errors, data } = validateShelterInput(body);
  const messages = Object.values(errors);
  if (messages.length > 0) return errorResponse(400, messages[0], { errors });

  await connectDB();
  const shelter = await Shelter.create({ ...data, createdBy: user._id });
  return Response.json(shelter, { status: 201 });
}
