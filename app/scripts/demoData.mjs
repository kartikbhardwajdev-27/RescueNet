// The demo scene shared by `npm run demo:seed` (local database, scripts/seed-demo.mjs) and
// `npm run demo:seed:hosted` (scripts/seed-hosted.mjs): the six demo shelters, two demo accounts,
// incidents of every severity and a few events. Everything is marked `seeded: true`.
import bcrypt from "bcryptjs";
import { scoreDescription } from "../lib/triage.js";
import Event from "../models/Event.js";
import Incident from "../models/Incident.js";
import Shelter from "../models/Shelter.js";
import User from "../models/User.js";

export const CITIZEN_EMAIL = "demo.citizen@rescuenet.test";
export const ORG_EMAIL = "demo.org@rescuenet.test";

const point = (lng, lat) => ({ type: "Point", coordinates: [lng, lat] });
const MIN = 60_000;

const DEMO_USERS = [
  {
    email: CITIZEN_EMAIL,
    name: "Demo Citizen",
    phone: "0000000001",
    role: "citizen",
    // A saved location (Sector 17, Chandigarh): "Nearest shelter" falls back to it
    // when the browser will not give a location.
    location: point(76.7827, 30.7398),
  },
  {
    email: ORG_EMAIL,
    name: "Demo Organizer",
    phone: "0000000002",
    role: "organization",
    org: { orgName: "Demo Relief Team", orgType: "volunteer group", description: "Demo account for rehearsals.", contactInfo: "demo.org@rescuenet.test" },
  },
];

// minutesAgo: when it was reported. resolvedMinutesAgo: when it was resolved.
// reporter: "citizen" attaches the demo citizen (so "My reports" has something).
const DEMO_INCIDENTS = [
  { sos: true, message: "[DEMO] trapped in the basement, water is rising, child with me", severity: "critical", status: "reported", minutesAgo: 4, reporter: "citizen", lng: 76.819, lat: 30.6485 },
  { type: "flood", severity: "high", status: "in_progress", minutesAgo: 25, reporter: "citizen", lng: 76.781, lat: 30.735, address: "Sector 22 market, Chandigarh", description: "[DEMO] Street flooded near the Sector 22 market. Two cars are stuck and elderly residents cannot get out." },
  { type: "fire", severity: "high", status: "reported", minutesAgo: 55, lng: 76.7195, lat: 30.706, address: "Phase 7 market, Mohali", description: "[DEMO] Small fire in a shop in the Phase 7 market. Smoke is spreading, shopkeepers have moved out." },
  { type: "medical", severity: "high", status: "reported", minutesAgo: 100, lng: 76.859, lat: 30.6955, address: "Bus stand, Sector 5, Panchkula", description: "[DEMO] Elderly man collapsed near the bus stand and is not breathing normally. Bystanders are with him." },
  { type: "earthquake", severity: "medium", status: "in_progress", minutesAgo: 120, lng: 76.646, lat: 30.746, address: "Old town, Kharar", description: "[DEMO] Cracks in the wall of an old building. Residents have moved outside and are waiting." },
  { type: "other", severity: "low", status: "reported", minutesAgo: 180, lng: 76.7835, lat: 30.741, address: "Sector 17, Chandigarh", description: "[DEMO] Tree fallen across one lane. Traffic is moving slowly." },
  { type: "flood", severity: "low", status: "resolved", minutesAgo: 420, resolvedMinutesAgo: 180, lng: 76.847, lat: 30.588, address: "Sports ground, Dera Bassi", description: "[DEMO] Waterlogging near the sports ground has drained." },
  { type: "fire", severity: "high", status: "resolved", minutesAgo: 1560, resolvedMinutesAgo: 1500, lng: 76.7195, lat: 30.711, address: "Phase 3, Mohali", description: "[DEMO] Kitchen fire in a house was put out. Nobody was hurt." },
  { sos: true, message: "[DEMO] someone fainted in the market, help has arrived", severity: "critical", status: "resolved", minutesAgo: 1800, resolvedMinutesAgo: 1770, reporter: "citizen", lng: 76.7794, lat: 30.7333 },
];

// Events start at a fixed hour of the local day, so a rehearsal always sees
// "tomorrow 10:00" and the like.
function dayAt(daysAhead, hour) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, 0, 0, 0);
  return d;
}
const DEMO_EVENTS = [
  { title: "[DEMO] Flood relief volunteer drive", type: "volunteer_drive", description: "Help sort and pack relief kits at the Sector 22 camp. Bring water and a hat.", address: "Relief camp, Sector 22, Chandigarh", lng: 76.7794, lat: 30.7333, start: dayAt(1, 10), end: dayAt(1, 14), capacity: 30 },
  { title: "[DEMO] Blanket and food donation camp", type: "donation_camp", description: "Drop off blankets, dry food and drinking water. Everything goes to the open shelters.", address: "Phase 7 market, Mohali", lng: 76.7179, lat: 30.7046, start: dayAt(2, 9), end: dayAt(2, 17) },
  { title: "[DEMO] Basic first-aid training", type: "training", description: "A short hands-on session. Only two places, so you can try the full event.", address: "Community hall, Sector 5, Panchkula", lng: 76.8606, lat: 30.6942, start: dayAt(3, 16), end: dayAt(3, 18), capacity: 2 },
  { title: "[DEMO] Flood safety awareness walk", type: "awareness", description: "A short walk through the neighbourhood explaining where the shelters are and what to pack.", address: "Sector 17 plaza, Chandigarh", lng: 76.7827, lat: 30.7398, start: dayAt(5, 17) },
];

export const DEMO_SHELTERS = [
  { name: "DEMO: Zirakpur Community Hall", address: "Zirakpur, Punjab (demo location)", lng: 76.8173, lat: 30.6425, capacity: 150, occupied: 62, status: "open" },
  { name: "DEMO: Mohali Phase 7 School Shelter", address: "Phase 7, SAS Nagar (Mohali), Punjab (demo location)", lng: 76.7179, lat: 30.7046, capacity: 250, occupied: 130, status: "open" },
  { name: "DEMO: Chandigarh Sector 22 Relief Camp", address: "Sector 22, Chandigarh (demo location)", lng: 76.7794, lat: 30.7333, capacity: 400, occupied: 400, status: "full" },
  { name: "DEMO: Panchkula Sector 5 Hall", address: "Sector 5, Panchkula, Haryana (demo location)", lng: 76.8606, lat: 30.6942, capacity: 120, occupied: 35, status: "open" },
  { name: "DEMO: Dera Bassi Sports Ground", address: "Dera Bassi, Punjab (demo location)", lng: 76.847, lat: 30.588, capacity: 300, occupied: 90, status: "open" },
  { name: "DEMO: Kharar Gurdwara Shelter", address: "Kharar, Punjab (demo location)", lng: 76.646, lat: 30.746, capacity: 80, occupied: 0, status: "closed" },
];

// Inserts the demo shelters that are missing (matched by name); never overwrites. Returns how many were added.
export async function seedShelters({ log = console.log } = {}) {
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
    log(`  ${result.upsertedCount > 0 ? "inserted      " : "already there "} ${doc.name}  [${doc.status}, ${doc.occupied}/${doc.capacity}]`);
  }
  return { inserted, total: DEMO_SHELTERS.length };
}

// Puts the demo scene (two accounts, incidents, events) in the connected database, back to its
// starting state: times move to "just now", nothing that is not `seeded: true` is touched.
// Mongoose must already be connected. Returns { error } (nothing written) or { ok: true }.
export async function seedScene({ password, log = console.log }) {
  const now = Date.now();
  await Promise.all([User.init(), Incident.init(), Event.init()]);

  // A real account on a demo address would be a surprise: check every one
  // before writing anything, so a refusal leaves the database as it was.
  for (const { email } of DEMO_USERS) {
    const existing = await User.findOne({ email }).select("seeded").lean();
    if (existing && !existing.seeded) {
      return { error: `${email} already exists and is not a demo account. Nothing was changed.` };
    }
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const accounts = {};
  for (const { email, ...fields } of DEMO_USERS) {
    const doc = { email, ...fields, passwordHash, seeded: true };
    await new User(doc).validate();
    const t = new Date(now);
    await User.collection.updateOne({ email }, { $set: { ...doc, updatedAt: t }, $setOnInsert: { createdAt: t } }, { upsert: true });
    accounts[fields.role] = await User.findOne({ email }).select("_id").lean();
    log(`  account   ${email} (${fields.role})`);
  }

  // Incidents, put back to their starting state with times relative to now.
  for (const item of DEMO_INCIDENTS) {
    const description = item.sos ? `SOS alert: ${item.message}` : item.description;
    const { score, reasons } = scoreDescription(item.sos ? item.message : item.description);
    const createdAt = new Date(now - item.minutesAgo * MIN);
    const updatedAt = new Date(now - (item.resolvedMinutesAgo ?? item.minutesAgo) * MIN);
    const doc = {
      type: item.sos ? "other" : item.type,
      description,
      location: point(item.lng, item.lat),
      severity: item.severity,
      status: item.status,
      isSos: Boolean(item.sos),
      triage: { score, reasons },
      seeded: true,
      ...(item.address ? { address: item.address } : {}),
      ...(item.reporter === "citizen" ? { reportedBy: accounts.citizen._id } : {}),
    };
    await new Incident(doc).validate();
    // Raw write: Mongoose would stamp its own createdAt/updatedAt.
    const unset = {};
    if (!item.address) unset.address = "";
    if (item.reporter !== "citizen") unset.reportedBy = "";
    await Incident.collection.updateOne(
      { seeded: true, description },
      { $set: { ...doc, createdAt, updatedAt }, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
      { upsert: true },
    );
    log(`  incident  ${item.severity.padEnd(8)} ${item.status.padEnd(11)} ${description.slice(0, 70)}`);
  }

  // Events.
  for (const item of DEMO_EVENTS) {
    const doc = {
      title: item.title,
      description: item.description,
      type: item.type,
      address: item.address,
      location: point(item.lng, item.lat),
      startsAt: item.start,
      ...(item.end ? { endsAt: item.end } : {}),
      ...(item.capacity ? { capacity: item.capacity } : {}),
      organizer: accounts.organization._id,
      status: "upcoming",
      seeded: true,
    };
    await new Event(doc).validate();
    const unset = {};
    if (!item.end) unset.endsAt = "";
    if (!item.capacity) unset.capacity = "";
    const t = new Date(now);
    await Event.collection.updateOne(
      { seeded: true, title: item.title },
      {
        $set: { ...doc, updatedAt: t },
        // people who already joined stay joined
        $setOnInsert: { createdAt: t, attendees: [] },
        ...(Object.keys(unset).length ? { $unset: unset } : {}),
      },
      { upsert: true },
    );
    log(`  event     ${item.type.padEnd(14)} ${item.title}`);
  }
  return { ok: true };
}
