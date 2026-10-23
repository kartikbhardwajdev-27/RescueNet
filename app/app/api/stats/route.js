import connectDB from "@/lib/db";
import Incident from "@/models/Incident";
import Shelter from "@/models/Shelter";

// Numbers for the Home dashboard, straight from the database.
//   activeIncidents  incidents that are not resolved yet
//   resolvedToday    incidents resolved since local midnight on the server. The
//                    resolve time isn't stored on its own; updatedAt is the stand-in,
//                    which is exact while status is the only editable incident field.
//   sheltersOpen     shelters with status "open"
//   spacesFree       capacity minus occupied, summed over open shelters
//   lastUpdated      when these numbers were computed
export async function GET() {
  await connectDB();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [activeIncidents, resolvedToday, [open]] = await Promise.all([
    Incident.countDocuments({ status: { $ne: "resolved" } }),
    Incident.countDocuments({ status: "resolved", updatedAt: { $gte: startOfToday } }),
    Shelter.aggregate([
      { $match: { status: "open" } },
      { $group: { _id: null, shelters: { $sum: 1 }, spacesFree: { $sum: { $subtract: ["$capacity", "$occupied"] } } } },
    ]),
  ]);

  return Response.json({
    activeIncidents,
    resolvedToday,
    sheltersOpen: open?.shelters ?? 0,
    spacesFree: open?.spacesFree ?? 0,
    lastUpdated: new Date().toISOString(),
  });
}
