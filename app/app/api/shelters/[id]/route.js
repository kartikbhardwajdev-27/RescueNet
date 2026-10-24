import { getCurrentUser } from "@/lib/auth";
import connectDB from "@/lib/db";
import { badBody, errorResponse, readJsonBody } from "@/lib/http";
import { toPublicShelter } from "@/lib/publicView";
import { rateLimit } from "@/lib/rateLimit";
import { isObjectIdString, validateShelterUpdate } from "@/lib/validation";
import Shelter from "@/models/Shelter";

// Only the organization that created a shelter may change it, and only its
// occupied, capacity and status. Seeded demo shelters have no owner, so nobody can.
export async function PATCH(request, { params }) {
  const limited = rateLimit(request, "updates");
  if (limited) return limited;

  const user = await getCurrentUser();
  if (!user) return errorResponse(401, "Not authenticated");
  if (user.role !== "organization") return errorResponse(403, "Only organizations can update shelters");

  const { id } = await params;
  if (!isObjectIdString(id)) return errorResponse(400, "Invalid shelter id");

  await connectDB();
  const shelter = await Shelter.findById(id);
  if (!shelter) return errorResponse(404, "Shelter not found");
  if (shelter.seeded) return errorResponse(403, "Demo shelters can't be edited");
  if (!shelter.createdBy?.equals(user._id)) {
    return errorResponse(403, "You can only edit shelters your organization added");
  }

  const body = await readJsonBody(request);
  if (!body) return badBody(request);

  const { errors, updates } = validateShelterUpdate(body);
  const messages = Object.values(errors);
  if (messages.length > 0) return errorResponse(400, messages[0], { errors });

  // The stored value fills in whichever of the two wasn't sent.
  const capacity = updates.capacity ?? shelter.capacity;
  const occupied = updates.occupied ?? shelter.occupied;
  if (occupied > capacity) {
    const message = "Occupied cannot exceed capacity";
    return errorResponse(400, message, { errors: { [updates.capacity === undefined ? "occupied" : "capacity"]: message } });
  }

  shelter.set(updates);
  await shelter.save();
  return Response.json(toPublicShelter(shelter, user._id), { headers: { "Cache-Control": "no-store" } });
}
