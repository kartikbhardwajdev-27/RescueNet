import { getCurrentUser } from "@/lib/auth";
import connectDB from "@/lib/db";
import { eventHasEnded } from "@/lib/eventRules";
import { findEventView } from "@/lib/eventQueries";
import { badBody, errorResponse, readJsonBody } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";
import { isObjectIdString, validateEventUpdate } from "@/lib/validation";
import Event from "@/models/Event";

const NO_STORE = { "Cache-Control": "no-store" };

// Loads the event and checks that the caller is the organization that posted it.
// Returns { event } or { response } (an error to send back as is).
async function loadOwnEvent(id, user) {
  if (!isObjectIdString(id)) return { response: errorResponse(400, "Invalid event id") };
  await connectDB();
  // No `attendees` here: the list can be long and these checks do not need it.
  const event = await Event.findById(id).select("organizer status startsAt endsAt");
  if (!event) return { response: errorResponse(404, "Event not found") };
  if (!event.organizer.equals(user._id)) {
    return { response: errorResponse(403, "You can only change events your organization posted") };
  }
  return { event };
}

// Edit an event. Only the organization that posted it may; only the fields in
// UPDATABLE_EVENT_FIELDS (lib/validation.js), never status, organizer or
// attendees. A cancelled or finished event can't be edited.
export async function PATCH(request, { params }) {
  const limited = rateLimit(request, "updates");
  if (limited) return limited;

  const user = await getCurrentUser();
  if (!user) return errorResponse(401, "Not authenticated");
  if (user.role !== "organization") return errorResponse(403, "Only organizations can edit events");

  const { id } = await params;
  const { event, response } = await loadOwnEvent(id, user);
  if (response) return response;
  if (event.status === "cancelled") return errorResponse(409, "A cancelled event can't be edited");
  if (eventHasEnded(event, Date.now())) return errorResponse(409, "An event that has already happened can't be edited");

  const body = await readJsonBody(request);
  if (!body) return badBody(request);

  const { errors, updates } = validateEventUpdate(body, event);
  const messages = Object.values(errors);
  if (messages.length > 0) return errorResponse(400, messages[0], { errors });

  // `null` means "remove it" (the end time, the limit).
  const $set = {};
  const $unset = {};
  for (const [key, value] of Object.entries(updates)) {
    if (value === null) $unset[key] = "";
    else $set[key] = value;
  }
  const update = {};
  if (Object.keys($set).length > 0) update.$set = $set;
  if (Object.keys($unset).length > 0) update.$unset = $unset;

  // A new capacity may not be lower than the people who already joined. That is
  // part of the update's own condition, so someone joining at the same moment
  // cannot slip past it.
  const filter = { _id: id, organizer: user._id, status: "upcoming" };
  if (typeof updates.capacity === "number") {
    filter.$expr = { $lte: [{ $size: { $ifNull: ["$attendees", []] } }, updates.capacity] };
  }

  const saved = await Event.findOneAndUpdate(filter, update, { new: true, runValidators: true, projection: { _id: 1 } });
  if (!saved) {
    const current = await Event.findById(id).select("status attendees");
    if (current?.status === "cancelled") return errorResponse(409, "A cancelled event can't be edited");
    const joined = current?.attendees?.length ?? 0;
    const message = `${joined} ${joined === 1 ? "person has" : "people have"} already joined, so the capacity can't be lower than ${joined}`;
    return errorResponse(409, message, { errors: { capacity: message } });
  }

  return Response.json(await findEventView(id, user._id), { headers: NO_STORE });
}

// Cancel an event ("delete" keeps the record, so the people who joined can still
// see that it was cancelled). Only the organization that posted it may. Cancelling
// twice is fine and changes nothing.
export async function DELETE(request, { params }) {
  const limited = rateLimit(request, "updates");
  if (limited) return limited;

  const user = await getCurrentUser();
  if (!user) return errorResponse(401, "Not authenticated");
  if (user.role !== "organization") return errorResponse(403, "Only organizations can cancel events");

  const { id } = await params;
  const { response } = await loadOwnEvent(id, user);
  if (response) return response;

  await Event.updateOne({ _id: id, organizer: user._id }, { $set: { status: "cancelled" } });
  return Response.json(await findEventView(id, user._id), { headers: NO_STORE });
}
