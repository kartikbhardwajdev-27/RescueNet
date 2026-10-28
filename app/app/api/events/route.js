import { getCurrentUser } from "@/lib/auth";
import connectDB from "@/lib/db";
import { eventTimeFilter, findEventView, findEventViews } from "@/lib/eventQueries";
import { badBody, errorResponse, readJsonBody } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";
import { parseEventQuery, validateEventInput } from "@/lib/validation";
import Event from "@/models/Event";

// The answers include "did the caller join" and "is the caller the organizer",
// so they are personal: keep them out of any shared cache.
const NO_STORE = { "Cache-Control": "no-store" };

// Events that are not over yet, soonest first. Cancelled events are not listed
// here (people who joined one see it in /api/events/mine).
//   ?type=volunteer_drive   one event type
//   ?near=lng,lat&radiusKm  only events within the radius (default 10 km)
//   ?when=upcoming|past|all upcoming is the default
//   ?limit=                 default 50, at most 200
export async function GET(request) {
  const { errors, filter, limit, when } = parseEventQuery(new URL(request.url).searchParams);
  const messages = Object.values(errors);
  if (messages.length > 0) return errorResponse(400, messages[0], { errors });

  // Logging in is optional here; it only fills in `joined` and `hosting`.
  const user = await getCurrentUser();

  await connectDB();
  const match = { ...filter, status: "upcoming", ...eventTimeFilter(when, Date.now()) };
  const sort = when === "past" ? { startsAt: -1, _id: 1 } : { startsAt: 1, _id: 1 };
  const events = await findEventViews(match, { viewerId: user?._id, sort, limit });
  return Response.json(events, { headers: NO_STORE });
}

// Only logged-in organizations may post events.
export async function POST(request) {
  const limited = await rateLimit(request, "events");
  if (limited) return limited;

  const user = await getCurrentUser();
  if (!user) return errorResponse(401, "Not authenticated");
  if (user.role !== "organization") return errorResponse(403, "Only organizations can post events");

  const body = await readJsonBody(request);
  if (!body) return badBody(request);

  const { errors, data } = validateEventInput(body);
  const messages = Object.values(errors);
  if (messages.length > 0) return errorResponse(400, messages[0], { errors });

  await connectDB();
  // organizer comes from the session, never from the body.
  const event = await Event.create({ ...data, organizer: user._id });
  const view = await findEventView(event._id, user._id);
  return Response.json(view, { status: 201, headers: NO_STORE });
}
