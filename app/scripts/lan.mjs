// Runs the production server so other devices on the same WiFi or hotspot can
// open RescueNet, and prints the address to type into the phone.
//
//   npm run build        (once, and again after any change)
//   npm run start:lan    start the server on every network interface
//   npm run lan:url      only print the addresses
//
// The server runs on this laptop, so the phone needs a connection to the laptop
// (same WiFi, or the laptop's hotspot) but NOT to the internet.
//
// Heads-up printed below and explained in docs/OFFLINE_APP.md: browsers only
// allow service workers, location and "install" on https or localhost, so over
// http://<laptop-ip> the app works but without those three.

import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const printOnly = process.argv.includes("--print");
const port = Number(process.env.PORT) || 3000;

// Private-network IPv4 addresses of this machine (the ones a phone on the same
// network can reach). Skips loopback and link-local (169.254.x.x) addresses.
function lanAddresses() {
  const isPrivate = (ip) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
  const found = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const info of list ?? []) {
      if (info.family === "IPv4" && !info.internal && isPrivate(info.address)) found.push({ name, address: info.address });
    }
  }
  // Wi-Fi (en0) first on a Mac.
  return found.sort((a, b) => Number(b.name === "en0") - Number(a.name === "en0"));
}

function describe() {
  const addresses = lanAddresses();
  const lines = [`  On this laptop:  http://localhost:${port}`];
  if (addresses.length === 0) {
    lines.push("", "  No local network address found. Connect this laptop to WiFi, or turn on its", "  hotspot and connect the phone to it, then run this again.");
  } else {
    lines.push("", "  On a phone on the same WiFi or hotspot (no internet needed):");
    for (const { name, address } of addresses) lines.push(`      http://${address}:${port}    (${name})`);
    lines.push(
      "",
      "  Over http://<address> the phone can use pages, the map, reports and SOS (saved",
      "  and re-sent if the connection drops). It cannot use the offline app shell,",
      "  location or install, because browsers only allow those on https or localhost.",
      "  See docs/OFFLINE_APP.md.",
    );
  }
  return lines.join("\n");
}

if (printOnly) {
  console.log(describe());
  process.exit(0);
}

if (!fs.existsSync(path.join(appRoot, ".next", "BUILD_ID"))) {
  console.error("There is no production build yet. Run `npm run build` first, then `npm run start:lan`.");
  process.exit(1);
}

console.log(`\nRescueNet is starting on all network interfaces (port ${port}).\n\n${describe()}\n`);

const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");
const server = spawn(process.execPath, [nextBin, "start", "-H", "0.0.0.0", "-p", String(port)], { cwd: appRoot, stdio: "inherit" });

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal));
server.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
