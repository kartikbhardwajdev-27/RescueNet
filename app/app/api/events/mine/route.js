import { getCurrentUser } from "@/lib/auth";
import connectDB from "@/lib/db";
import { eventTimeFilter, findEventViews } from "@/lib/eventQueries";
import { errorResponse } from "@/lib/http";
import { parseEventQuery } from "@/lib/validation";

const NO_STORE = { "Cache-Control": "no-store" };

// The logged-in person's own events: { hosting, joined }.
//   hosting  events their organization posted (cancelled ones included, with
//            attendeeCount, so they can see how many signed up)
//   joined   events they joined (cancelled ones included: someone who signed up
//            should find out it was cancelled)
// Takes the same filters as GET /api/events (type, near, when, limit). `when`
// defaults to upcoming, meaning not over yet.
export async function GET(request) {
  const user = await getCurrentUser();
  if (!user) return errorResponse(401, "Not authenticated");

  const { errors, filter, limit, when } = parseEventQuery(new URL(request.url).searchParams);
  const messages = Object.values(errors);
  if (messages.length > 0) return errorResponse(400, messages[0], { errors });

  await connectDB();
  const time = { ...filter, ...eventTimeFilter(when, Date.now()) };
  const sort = when === "past" ? { startsAt: -1, _id: 1 } : { startsAt: 1, _id: 1 };
  const options = { viewerId: user._id, sort, limit };
  const [hosting, joined] = await Promise.all([
    findEventViews({ ...time, organizer: user._id }, options),
    findEventViews({ ...time, attendees: user._id }, options),
  ]);
  return Response.json({ hosting, joined }, { headers: NO_STORE });
}
