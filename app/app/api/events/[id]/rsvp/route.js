import { getCurrentUser } from "@/lib/auth";
import connectDB from "@/lib/db";
import { eventHasEnded } from "@/lib/eventRules";
import { findEventView } from "@/lib/eventQueries";
import { errorResponse } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";
import { isObjectIdString } from "@/lib/validation";
import Event from "@/models/Event";

const NO_STORE = { "Cache-Control": "no-store" };

// Join an event. Any logged-in person may.
//
// Everything that must hold is part of ONE database update: the event exists, is
// not cancelled, has not ended, the caller has not joined already, and there is
// still a free space. Because the check and the write are the same operation,
// two people taking the last space at once cannot both get it, and the same
// person pressing twice cannot join twice. If the update matches nothing, the
// event is read again only to say WHICH of those was the reason.
export async function POST(request, { params }) {
  const limited = rateLimit(request, "rsvp");
  if (limited) return limited;

  const user = await getCurrentUser();
  if (!user) return errorResponse(401, "Not authenticated");

  const { id } = await params;
  if (!isObjectIdString(id)) return errorResponse(400, "Invalid event id");

  await connectDB();
  const now = new Date();
  const joined = await Event.findOneAndUpdate(
    {
      _id: id,
      status: "upcoming",
      attendees: { $ne: user._id },
      // not over yet: its end time, or its start time when it has no end time
      $or: [{ endsAt: { $gte: now } }, { endsAt: null, startsAt: { $gte: now } }],
      // no limit, or fewer people than the limit
      $expr: {
        $or: [
          { $eq: [{ $ifNull: ["$capacity", null] }, null] },
          { $lt: [{ $size: { $ifNull: ["$attendees", []] } }, "$capacity"] },
        ],
      },
    },
    { $addToSet: { attendees: user._id } },
    { new: true, projection: { _id: 1 } },
  );

  if (!joined) {
    const event = await Event.findById(id).select("status startsAt endsAt attendees");
    if (!event) return errorResponse(404, "Event not found");
    if (event.status === "cancelled") return errorResponse(409, "This event was cancelled");
    if (eventHasEnded(event, now.getTime())) return errorResponse(409, "This event has already ended");
    if (event.attendees.some((attendee) => attendee.equals(user._id))) return errorResponse(409, "You've already joined this event");
    return errorResponse(409, "This event is full");
  }

  return Response.json(await findEventView(id, user._id), { headers: NO_STORE });
}

// Leave an event. Leaving one you never joined changes nothing (and is not an
// error), so pressing it twice, or from two tabs, is harmless.
export async function DELETE(request, { params }) {
  const limited = rateLimit(request, "rsvp");
  if (limited) return limited;

  const user = await getCurrentUser();
  if (!user) return errorResponse(401, "Not authenticated");

  const { id } = await params;
  if (!isObjectIdString(id)) return errorResponse(400, "Invalid event id");

  await connectDB();
  const event = await Event.findByIdAndUpdate(id, { $pull: { attendees: user._id } }, { projection: { _id: 1 } });
  if (!event) return errorResponse(404, "Event not found");

  return Response.json(await findEventView(id, user._id), { headers: NO_STORE });
}
