// Loading events in the shape the API sends them. Server only.
//
// An event's `attendees` array holds user ids, and who joined is not for other
// people to see, so it is never sent. The database counts the attendees and
// checks whether the caller is one of them, and only those two answers leave:
//
//   { ...event fields,
//     organizer:     { _id, name, orgName },
//     attendeeCount: how many people joined,
//     spacesLeft:    capacity minus attendeeCount, or null when there is no limit,
//     joined:        whether the caller joined (false when not logged in),
//     hosting:       whether the caller is the organizer }

import mongoose from "mongoose";
import { spacesLeft } from "@/lib/eventRules";
import Event from "@/models/Event";
import User from "@/models/User";

const toObjectId = (id) => (id ? new mongoose.Types.ObjectId(String(id)) : null);

// The condition for "has this event not ended yet" / "has it ended": an event
// ends at its end time, or at its start time when it has no end time.
// `endsAt: null` matches a missing field too.
export function eventTimeFilter(when, nowMs) {
  const now = new Date(nowMs);
  if (when === "upcoming") return { $or: [{ endsAt: { $gte: now } }, { endsAt: null, startsAt: { $gte: now } }] };
  if (when === "past") return { $or: [{ endsAt: { $lt: now } }, { endsAt: null, startsAt: { $lt: now } }] };
  return {};
}

// `match` is a MongoDB filter (values must already be the right types: this does
// not cast strings to ids or dates). Returns plain objects, in `sort` order.
export async function findEventViews(match, { viewerId = null, sort = { startsAt: 1, _id: 1 }, limit = 100 } = {}) {
  const viewer = toObjectId(viewerId);
  const attendees = { $ifNull: ["$attendees", []] };

  const rows = await Event.aggregate([
    { $match: match },
    { $sort: sort },
    { $limit: limit },
    {
      $lookup: {
        from: User.collection.name,
        localField: "organizer",
        foreignField: "_id",
        as: "organizerDoc",
        pipeline: [{ $project: { name: 1, orgName: "$org.orgName" } }],
      },
    },
    {
      $addFields: {
        organizer: { $first: "$organizerDoc" },
        attendeeCount: { $size: attendees },
        joined: viewer ? { $in: [viewer, attendees] } : false,
      },
    },
    { $project: { attendees: 0, organizerDoc: 0, __v: 0 } },
  ]);

  return rows.map((row) => ({
    ...row,
    spacesLeft: spacesLeft(row.capacity, row.attendeeCount),
    hosting: Boolean(viewer && row.organizer && row.organizer._id.equals(viewer)),
  }));
}

export async function findEventView(id, viewerId = null) {
  const [view] = await findEventViews({ _id: toObjectId(id) }, { viewerId, limit: 1 });
  return view ?? null;
}
