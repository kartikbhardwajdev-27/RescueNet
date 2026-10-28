// Fills the LOCAL database with a clearly marked demo scene: incidents of every
// severity (some resolved), two demo accounts, and a few events. Everything it
// makes has `seeded: true` and "[DEMO]" in its text.
//
//   npm run demo:seed     (also adds the six demo shelters)
//   npm run demo:clear    removes the demo incidents, events and accounts
//   npm run demo:wipe     deletes the WHOLE database, but only when its name ends
//                         in "_demo" (for a laptop kept just for the demo)
//
// Safe to run again: each demo record is matched by its text or email and put
// back to its starting state, with times moved to "just now", so the scene is
// fresh before every rehearsal. Joined events keep their attendees. Nothing that
// is not marked `seeded: true` is ever changed or deleted.
//
// Refuses to run unless MONGODB_URI points at a local database.
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import Event from "../models/Event.js";
import Incident from "../models/Incident.js";
import User from "../models/User.js";
import { CITIZEN_EMAIL, ORG_EMAIL, seedScene } from "./demoData.mjs";
import { localTarget } from "./localOnly.mjs";

try {
  process.loadEnvFile(fileURLToPath(new URL("../.env.local", import.meta.url)));
} catch {
  // No .env.local: use whatever is already in the environment.
}

const target = localTarget(process.env.MONGODB_URI);
if (target.error) {
  console.error(`Refusing to run: ${target.error}`);
  process.exit(2);
}
const clearing = process.argv.includes("--clear");
const wiping = process.argv.includes("--wipe");

// The one destructive option: only for a database that was named for the demo,
// so it can never be pointed at the everyday "rescuenet" database by accident.
if (wiping && !/_demo$/.test(target.db)) {
  console.error(
    `Refusing to wipe "${target.db}". --wipe only works on a database whose name ends in "_demo" ` +
      `(for example mongodb://127.0.0.1:27017/rescuenet_demo). Use "npm run demo:clear" to remove just the demo records.`,
  );
  process.exit(4);
}

// ---- the demo scene (scripts/demoData.mjs) ----

const DEMO_PASSWORD = "demo-rescuenet-2026";

// ---- run -------------------------------------------------------------------

console.log(`${wiping ? "Wiping" : clearing ? "Removing the demo data from" : "Seeding demo data into"} ${target.host}/${target.db}`);
await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });

try {
  if (wiping) {
    await mongoose.connection.dropDatabase();
    console.log(`Dropped the database "${target.db}". Run "npm run demo:seed" to fill it again.`);
  } else if (clearing) {
    const users = await User.find({ seeded: true }).select("_id").lean();
    const ids = users.map((u) => u._id);
    const incidents = await Incident.deleteMany({ seeded: true });
    const events = await Event.deleteMany({ seeded: true });
    // Anyone who joined a real event keeps it; only the demo accounts leave.
    if (ids.length > 0) await Event.updateMany({ attendees: { $in: ids } }, { $pull: { attendees: { $in: ids } } });
    const removedUsers = await User.deleteMany({ seeded: true });
    console.log(`Removed ${incidents.deletedCount} incidents, ${events.deletedCount} events, ${removedUsers.deletedCount} accounts.`);
    console.log("(The demo shelters stay; they are not touched here.)");
  } else {
    const seeded = await seedScene({ password: DEMO_PASSWORD });
    if (seeded.error) {
      console.error(`Refusing to run: ${seeded.error}`);
      process.exitCode = 3;
      throw new Error("stop");
    }

    console.log(`
Done. Log in at /login with:

  Citizen       ${CITIZEN_EMAIL}
  Organization  ${ORG_EMAIL}
  Password      ${DEMO_PASSWORD}   (both accounts)

Run it again any time to put the demo scene back to its starting state.
Remove it all with:  npm run demo:clear`);
  }
} catch (err) {
  // The refusal above already said why; anything else is a real error.
  if (err?.message !== "stop") throw err;
} finally {
  await mongoose.disconnect();
}
