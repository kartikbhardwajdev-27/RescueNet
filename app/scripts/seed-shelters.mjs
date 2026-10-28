// Seeds six clearly-labelled DEMO shelters around Chandigarh / Mohali.
//
//   npm run seed:shelters
//
// Safe to re-run: shelters are matched by name and only inserted when missing,
// so nothing is duplicated and nothing already there is overwritten.
// Refuses to run unless MONGODB_URI points at a local database.
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { seedShelters } from "./demoData.mjs";
import { localTarget } from "./localOnly.mjs";

try {
  process.loadEnvFile(fileURLToPath(new URL("../.env.local", import.meta.url)));
} catch {
  // No .env.local: fall back to whatever is already in the environment.
}

const target = localTarget(process.env.MONGODB_URI);
if (target.error) {
  console.error(`Refusing to seed: ${target.error}`);
  process.exit(2);
}

console.log(`Seeding demo shelters into ${target.host}/${target.db}`);
await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });

try {
  const { inserted, total } = await seedShelters();
  console.log(`\nDone: ${inserted} inserted, ${total - inserted} already present.`);
} finally {
  await mongoose.disconnect();
}
