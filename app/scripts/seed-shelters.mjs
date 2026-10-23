// Seeds six clearly-labelled DEMO shelters around Chandigarh / Mohali.
//
//   npm run seed:shelters
//
// Safe to re-run: shelters are matched by name and only inserted when missing,
// so nothing is duplicated and nothing already there is overwritten.
// Refuses to run unless MONGODB_URI points at a local database.
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import Shelter from "../models/Shelter.js";

try {
  process.loadEnvFile(fileURLToPath(new URL("../.env.local", import.meta.url)));
} catch {
  // No .env.local: fall back to whatever is already in the environment.
}

// Only ever seed a database running on this machine.
function localTarget(uri) {
  if (!uri) return { error: "MONGODB_URI is not set (see .env.local.example)." };
  let url;
  try {
    url = new URL(uri);
  } catch {
    return { error: "MONGODB_URI is not a single-host connection string, so it can't be verified as local." };
  }
  if (url.protocol !== "mongodb:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    return { error: `MONGODB_URI points at "${url.hostname || url.protocol}", not a local database.` };
  }
  return { host: url.host, db: url.pathname.replace(/^\//, "") };
}

const target = localTarget(process.env.MONGODB_URI);
if (target.error) {
  console.error(`Refusing to seed: ${target.error}`);
  process.exit(2);
}

const DEMO_SHELTERS = [
  { name: "DEMO: Zirakpur Community Hall", address: "Zirakpur, Punjab (demo location)", lng: 76.8173, lat: 30.6425, capacity: 150, occupied: 62, status: "open" },
  { name: "DEMO: Mohali Phase 7 School Shelter", address: "Phase 7, SAS Nagar (Mohali), Punjab (demo location)", lng: 76.7179, lat: 30.7046, capacity: 250, occupied: 130, status: "open" },
  { name: "DEMO: Chandigarh Sector 22 Relief Camp", address: "Sector 22, Chandigarh (demo location)", lng: 76.7794, lat: 30.7333, capacity: 400, occupied: 400, status: "full" },
  { name: "DEMO: Panchkula Sector 5 Hall", address: "Sector 5, Panchkula, Haryana (demo location)", lng: 76.8606, lat: 30.6942, capacity: 120, occupied: 35, status: "open" },
  { name: "DEMO: Dera Bassi Sports Ground", address: "Dera Bassi, Punjab (demo location)", lng: 76.847, lat: 30.588, capacity: 300, occupied: 90, status: "open" },
  { name: "DEMO: Kharar Gurdwara Shelter", address: "Kharar, Punjab (demo location)", lng: 76.646, lat: 30.746, capacity: 80, occupied: 0, status: "closed" },
];

console.log(`Seeding demo shelters into ${target.host}/${target.db}`);
await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });

try {
  await Shelter.init();
  let inserted = 0;
  for (const { lng, lat, ...fields } of DEMO_SHELTERS) {
    const doc = { ...fields, location: { type: "Point", coordinates: [lng, lat] }, seeded: true };
    await new Shelter(doc).validate();

    const now = new Date();
    const result = await Shelter.updateOne(
      { seeded: true, name: doc.name },
      { $setOnInsert: { ...doc, createdAt: now, updatedAt: now } },
      // Mongoose would otherwise bump updatedAt on every re-run.
      { upsert: true, timestamps: false },
    );
    if (result.upsertedCount > 0) inserted += 1;
    console.log(`  ${result.upsertedCount > 0 ? "inserted      " : "already there "} ${doc.name}  [${doc.status}, ${doc.occupied}/${doc.capacity}]`);
  }
  console.log(`\nDone: ${inserted} inserted, ${DEMO_SHELTERS.length - inserted} already present.`);
} finally {
  await mongoose.disconnect();
}
