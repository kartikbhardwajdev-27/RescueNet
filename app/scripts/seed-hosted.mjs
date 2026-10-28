// Puts the demo shelters and the demo scene (two demo accounts, incidents, events) into a
// HOSTED MongoDB (Atlas). Everything it writes is marked `seeded: true` and "[DEMO]"/"DEMO:".
//
//   MONGODB_URI='mongodb+srv://...' DEMO_PASSWORD='a-password-of-your-own' \
//     npm run demo:seed:hosted -- --hosted
//
// Safety:
//   - needs the explicit --hosted flag;
//   - reads MONGODB_URI and DEMO_PASSWORD from the environment only (never from .env.local,
//     which points at the laptop's database);
//   - refuses a local database (use `npm run demo:seed` for that), a missing, short, weak or
//     default DEMO_PASSWORD;
//   - shows the host and database name and asks you to type the database name to go on;
//   - writes only demo shelters and demo records; it never deletes anything and never changes
//     a record that is not marked `seeded: true`. It refuses if a real account already uses a
//     demo email address.
import readline from "node:readline/promises";
import mongoose from "mongoose";
import { seedScene, seedShelters, CITIZEN_EMAIL, ORG_EMAIL } from "./demoData.mjs";
import { demoPasswordProblem, describeHostedTarget } from "./hostedGuard.mjs";

const fail = (message, code) => {
  console.error(`Refusing to run: ${message}`);
  process.exit(code);
};

if (!process.argv.includes("--hosted")) {
  fail("this script writes to a hosted database, so it needs the --hosted flag.\n  npm run demo:seed:hosted -- --hosted\n(For the laptop's own database use: npm run demo:seed)", 2);
}

const target = describeHostedTarget(process.env.MONGODB_URI);
if (target.error) fail(target.error, 2);
if (target.local) fail("MONGODB_URI points at this machine. Use `npm run demo:seed` for the laptop's database.", 2);

const passwordProblem = demoPasswordProblem(process.env.DEMO_PASSWORD);
if (passwordProblem) fail(passwordProblem, 3);

console.log(`
About to add DEMO data to a hosted database:

  host      ${target.host}
  database  ${target.db}

It adds six demo shelters, two demo accounts (${CITIZEN_EMAIL}, ${ORG_EMAIL}),
demo incidents and demo events, all marked as demo. It deletes nothing.
`);
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const typed = (await rl.question(`Type the database name (${target.db}) to continue: `)).trim();
rl.close();
if (typed !== target.db) fail("what you typed is not the database name. Nothing was changed.", 4);

await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
try {
  const shelters = await seedShelters();
  console.log(`\nShelters: ${shelters.inserted} added, ${shelters.total - shelters.inserted} already there.\n`);
  const scene = await seedScene({ password: process.env.DEMO_PASSWORD });
  if (scene.error) fail(scene.error, 3);
  console.log(`
Done. Log in at your site's /login with ${CITIZEN_EMAIL} or ${ORG_EMAIL}
and the DEMO_PASSWORD you set. Run it again to put the demo scene back to its starting state.`);
} finally {
  await mongoose.disconnect();
}
