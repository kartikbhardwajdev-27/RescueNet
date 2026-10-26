// npm run build:mobile
//
// Builds ONLY the UI, as a static export for the Android app, into app/out/.
// The website build (npm run build) is untouched: nothing in this script writes
// to .next/ or to any source file.
//
// How: Next.js cannot leave API routes or dynamic-id routes out of a static
// export from a config option, and the website and the app differ in a few small
// files, so the build runs on a scratch copy of the app (app/dist/mobile-src,
// git-ignored, deleted when the build succeeds):
//
//   1. copy app/, components/, lib/, public/ without what the app cannot have:
//        app/api               the server lives on the laptop, not in the app
//        app/incidents/[id]    a dynamic route; the overlay has /incidents/view?id=
//        app/manifest.js, public/sw.js, public/offline.html
//                              website-only: the app's files are inside the APK
//   2. copy mobile/overlay/ on top. It adds the app-only files (Settings, the
//      first-run screen, the native HTTP and storage code) and REPLACES a few
//      website files with app versions that export the same things:
//        lib/apiClient.js  lib/clientSession.js  lib/incidentLinks.js
//        lib/savedData.js  lib/devicePosition.js  components/map/mapRuntime.js
//        components/PlatformGate.js  components/platformNav.js
//        components/ServiceWorkerRegister.js
//      The website's own versions of those are tiny and know nothing about the
//      app, so no Android code can end up in the website build.
//   3. use mobile/next.config.mjs (output: "export")
//   4. next build
//   5. add a Content-Security-Policy <meta> tag to every exported page (the app
//      has no HTTP headers to carry one)
//   6. move the export to app/out/, which `npx cap sync` copies into the APK
//
// The road graph for directions (public/routing/, made by npm run routing:build, about
// 1 MB) is bundled as it is and checked first: both files present, the graph intact
// (its size and SHA-256 match meta.json). A graph over ROUTING_LIMIT_MB is not bundled
// without asking: the build stops and says so.
//
// The offline map (public/maps/tricity.pmtiles) is bundled as it is. It is not
// in git (docs/OFFLINE_MAP.md says how to make it), so the build stops if it is
// missing, and stops above MAP_LIMIT_MB: a bigger map should be downloaded by the
// app on first run instead of being bundled, which is not built (see
// docs/APK_SETUP.md).

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const work = path.join(appRoot, "dist", "mobile-src");
const exportDir = path.join(appRoot, "out");
const MAP_FILE = path.join("public", "maps", "tricity.pmtiles");
const MAP_LIMIT_MB = 150;
const ROUTING_DIR = path.join("public", "routing");
const ROUTING_FILES = ["tricity-roads.rnrg", "meta.json"];
const ROUTING_LIMIT_MB = 40;

const fail = (message) => {
  console.error(`\nbuild:mobile failed: ${message}\n`);
  process.exit(1);
};

// Paths (relative to app/, forward slashes) left out of the copy.
const LEFT_OUT = new Set(["app/api", "app/incidents/[id]", "app/manifest.js", "public/sw.js", "public/offline.html"]);

const mapPath = path.join(appRoot, MAP_FILE);
if (!fs.existsSync(mapPath)) {
  fail(`${MAP_FILE} is missing. Make it first: see docs/OFFLINE_MAP.md (the pmtiles extract command).`);
}
const mapMb = fs.statSync(mapPath).size / 1024 / 1024;
if (mapMb > MAP_LIMIT_MB) {
  fail(
    `${MAP_FILE} is ${mapMb.toFixed(0)} MB, over the ${MAP_LIMIT_MB} MB limit for bundling it in the app. ` +
      "Extract a smaller area (lower --maxzoom or a tighter --bbox in docs/OFFLINE_MAP.md).",
  );
}

// The road graph: present, intact, and small enough to bundle without asking.
let routingBytes = 0;
for (const name of ROUTING_FILES) {
  const file = path.join(appRoot, ROUTING_DIR, name);
  if (!fs.existsSync(file)) fail(`${path.join(ROUTING_DIR, name)} is missing. Make it with npm run routing:build (docs/NAVIGATION.md).`);
  routingBytes += fs.statSync(file).size;
}
const routingMb = routingBytes / 1024 / 1024;
if (routingMb > ROUTING_LIMIT_MB) {
  fail(
    `the road graph is ${routingMb.toFixed(1)} MB, over the ${ROUTING_LIMIT_MB} MB limit. It is not bundled without asking: ` +
      "check the size with Kartik first, then raise ROUTING_LIMIT_MB in this script.",
  );
}
{
  const meta = JSON.parse(fs.readFileSync(path.join(appRoot, ROUTING_DIR, "meta.json"), "utf8"));
  const graph = fs.readFileSync(path.join(appRoot, ROUTING_DIR, meta.file ?? ROUTING_FILES[0]));
  const sha256 = crypto.createHash("sha256").update(graph).digest("hex");
  if (sha256 !== meta.sha256 || graph.length !== meta.bytes?.file) {
    fail("the road graph does not match its meta.json (damaged, or meta.json is from another build). Run npm run routing:build again.");
  }
}

fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });

function copyInto(relative) {
  fs.cpSync(path.join(appRoot, relative), path.join(work, relative), {
    recursive: true,
    filter: (source) => {
      const rel = path.relative(appRoot, source).split(path.sep).join("/");
      return !LEFT_OUT.has(rel);
    },
  });
}
for (const entry of ["app", "components", "lib", "public", "jsconfig.json", "package.json"]) copyInto(entry);

// The map code finds MapLibre's worker file by a path relative to itself
// (components/map/mapRuntime.js), so the copy needs a node_modules where it expects one.
fs.symlinkSync(path.join(appRoot, "node_modules"), path.join(work, "node_modules"), "dir");

fs.cpSync(path.join(appRoot, "mobile", "overlay"), work, { recursive: true });
fs.copyFileSync(path.join(appRoot, "mobile", "next.config.mjs"), path.join(work, "next.config.mjs"));

console.log("Building the static export for the Android app…\n");
const nextBin = path.join(appRoot, "node_modules", "next", "dist", "bin", "next");
const build = spawnSync(process.execPath, [nextBin, "build"], {
  cwd: work,
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: "1",
    RESCUENET_APP_ROOT: appRoot,
  },
});
if (build.status !== 0) fail(`next build exited with ${build.status}. The scratch copy is kept in dist/mobile-src.`);

const built = path.join(work, "out");
if (!fs.existsSync(path.join(built, "index.html"))) fail("the export has no index.html.");

// The app must hold no server code. An api folder, a route file or a server
// bundle in the export would mean something leaked in.
const stray = ["api"].filter((name) => fs.existsSync(path.join(built, name)));
if (stray.length > 0) fail(`the export contains server routes: ${stray.join(", ")}`);
for (const name of ROUTING_FILES) {
  if (!fs.existsSync(path.join(built, "routing", name))) fail(`the export is missing routing/${name}.`);
}
for (const page of ["settings", path.join("incidents", "view")]) {
  if (!fs.existsSync(path.join(built, page, "index.html"))) fail(`the export is missing the ${page} page.`);
}
if (fs.existsSync(path.join(built, "incidents", "000000000000000000000000"))) {
  fail("the export contains the website's /incidents/[id] page.");
}

// The Android app's Content-Security-Policy. The pages are files inside the app,
// so there are no HTTP headers to carry it; a <meta> tag in <head> does the same
// job. Only the app's own files may load, and the page itself may make no network
// requests at all (connect-src 'self' is the app itself): the app's API calls are
// made natively by CapacitorHttp, outside the page. Mirrors next.config.mjs.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'self'",
].join("; ");
const CSP_META = `<meta http-equiv="Content-Security-Policy" content="${CSP}"/>`;

function addCsp(dir) {
  let pages = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      pages += addCsp(full);
    } else if (entry.name.endsWith(".html")) {
      const html = fs.readFileSync(full, "utf8");
      if (!/<head[^>]*>/.test(html)) fail(`${path.relative(built, full)} has no <head> to put the Content-Security-Policy in.`);
      // First thing in <head>: a policy only applies to what comes after it.
      fs.writeFileSync(full, html.replace(/<head[^>]*>/, (open) => `${open}${CSP_META}`));
      pages += 1;
    }
  }
  return pages;
}
const cspPages = addCsp(built);
console.log(`Content-Security-Policy added to ${cspPages} pages.`);

fs.rmSync(exportDir, { recursive: true, force: true });
fs.renameSync(built, exportDir);
fs.rmSync(work, { recursive: true, force: true });

function sizeOf(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    total += entry.isDirectory() ? sizeOf(full) : fs.statSync(full).size;
  }
  return total;
}
console.log(`\nStatic export ready in app/out (${(sizeOf(exportDir) / 1024 / 1024).toFixed(1)} MB, map ${mapMb.toFixed(1)} MB, road graph ${routingMb.toFixed(2)} MB).`);
console.log("Next: npx cap sync android (npm run apk does the whole chain).");
