# RescueNet build plan

Instructions for the `rescuenet-builder` agent. Follow this file exactly. Steps 1 to 26 are built. The last four (23 to 26) were offline road navigation to the nearest shelter.

## How to work

1. Find the first unfinished step. Check `git log --oneline` (commits are named `Step N: ...`), `git status`, and the files. Never redo a finished step.
2. If `git status` shows uncommitted Step 9 work (real data on Home and Shelters, `/api/shelters`, `/api/stats`, shelter seed script), commit it first as `Step 9: real data on Home and Shelters, stats API, shelter seed`, then continue.
3. For each step: build it, run `npm run lint` and `npm run build`, verify it (curl for APIs, the browser tool if connected, otherwise say so), commit as `Step N: <name>`, push the `rebuild` branch.
4. A step marked **CHECKPOINT** is different: build and verify it, then STOP. Tell Kartik exactly what to test by hand and wait for approval before you commit.
5. Continue to the next step automatically only if the current step fully passed its verification. If a step fails twice, stop and report. Do not guess.
6. When something is not specified, pick the simplest option and mention it in your report.
7. After each step, report briefly: what you built, files changed, what you verified and how, what you could NOT verify, and anything Kartik must do by hand.
8. After step 26, stop. Do not invent extra steps.

## Standing rules

- Branch: `rebuild`. Never push to `main`.
- Edit only inside `app/` and `docs/` (the repo root `docs/`). Never touch `client/` or `server/`.
- Never edit `.gitignore`. Never commit `.env.local`, secrets, or the `.pmtiles` map file.
- Zero internet at runtime: no CDN, no Google Fonts, no external URLs, no analytics. Everything is bundled or served from this app. The only exception is the one-time road data download in Step 23 (`npm run routing:build`), which is a build-time script and never runs in the app.
- UI style: dark theme, existing brand gradient, rounded cards, Space Grotesk and Inter (already bundled), `lucide-react` icons only.
- Colour meaning: red = emergency and SOS only, green = safe and shelter, amber = warning, blue = information.
- Commit messages have no `Co-Authored-By` line.
- Do not kill or restart Kartik's dev server on port 3000. Test on another port. Never touch his real account or his test incidents. Clean up any test data you create. Keep the seeded demo shelters.
- Local MongoDB at `127.0.0.1:27017/rescuenet`. Any script that writes data must refuse to run against a non-local URI.
- Never claim a check you did not do.

## Where things stand (steps 1 to 9)

Next.js app in `app/` (App Router, JavaScript, Tailwind). Mongoose models: `User`, `Incident`, `Shelter` (GeoJSON `location` with 2dsphere indexes). Cookie JWT auth with `/api/auth/register`, `login`, `logout`, `me`, with citizen and organization roles. Incidents and SOS API with rate limiting. Shelters and stats API. Pages: Home dashboard (real data), Report (wired to the API), Shelters, register, login, account. The Map, Resources and About pages are still placeholders. The dark Gen Z shell has a floating sidebar on desktop and a bottom tab bar with a center SOS button on mobile.

---

## Step 10: Offline map (CHECKPOINT)

Build the real Map page at `/map` that works with no internet.

1. Download the `pmtiles` CLI (go-pmtiles) as a release binary for macOS arm64. Do not use Homebrew, it is broken on this Mac. Keep the binary outside the repo, for example `~/bin`.
2. Find the latest daily build at `https://maps.protomaps.com/builds/` and run `pmtiles extract <build URL> app/public/maps/tricity.pmtiles --bbox=76.60,30.55,76.95,30.85 --maxzoom=14` (bbox order is west,south,east,north). Report the file size. If it is over 60 MB, use maxzoom 13 and run it again.
3. PMTiles needs HTTP Range requests. Check with `curl -r 0-100 -I` that the file is served with a 206 response. If it is not, add a small route handler that serves it with correct `Range`, `Content-Range` and `Accept-Ranges` headers.
4. Install `maplibre-gl`, `pmtiles` and `@protomaps/basemaps` from npm. Register the pmtiles protocol. Use the Protomaps dark theme.
5. Download the glyph (font) and sprite files ONCE from the protomaps `basemaps-assets` repository into `app/public/map-assets/` and use local URLs. Nothing may load from the internet at runtime.
6. The page is a client component loaded with `next/dynamic` and `ssr: false`. Full-height map card. Fit to the data bounds on load. With no data, centre on 30.65, 76.80 at zoom 11.
7. Markers from `GET /api/incidents` and `GET /api/shelters`. Incidents are coloured by severity (low blue, medium amber, high orange, critical red with a gentle pulse). Shelters are green. Clicking opens a popup: incidents show type, severity, status, address and reported time; shelters show a capacity bar and status.
8. User location dot plus a "My location" button. Filter chips (Incidents, Shelters). A legend. Refetch every 30 seconds while the tab is visible. Loading, empty and error states.
9. Deep links: `/map?focus=incident:<id>` and `/map?focus=shelter:<id>` fly to the item and open its popup. Update the "Open map", nearby and "View on map" links on Home and Shelters to use them.
10. Mobile: the map fills the screen above the bottom tab bar, with thumb-reachable controls.
11. Write `docs/OFFLINE_MAP.md` with the exact regenerate command.

Verify: lint, build, and a check that the map page makes no requests to non-localhost hosts (grep the build output, and use the browser network view if connected).
STOP and ask Kartik to test the map in the browser, then turn WiFi off and refresh `/map`.

## Step 11: Offline app and LAN access (CHECKPOINT)

The server runs on the laptop, so "offline" here means no internet, not no server.

1. Add npm scripts to run the production server on all interfaces (`next start -H 0.0.0.0`) and print the laptop's LAN URL, so phones on the same WiFi or hotspot can open the app with no internet.
2. Browsers only allow service workers and geolocation on a secure context. That works on `localhost`, but NOT on `http://<LAN-IP>`. Investigate `next dev --experimental-https` (self-signed certificate, the user accepts a warning once) and document exactly what works and what does not on a phone. Do not claim phone support you did not verify.
3. Add a web app manifest, icons generated locally from the existing logo, and a hand-written service worker (`public/sw.js`, no external packages) that caches the app shell and static assets. Do not cache API responses forever. Do not break the pmtiles Range requests.
4. Offline queue: reports and SOS made while the server is unreachable are stored in IndexedDB and sent automatically when the connection returns (`online` event plus a retry timer). Each item has status `queued`, `sending`, `sent` or `failed`. SOS is sent first.
5. UI: a clear "Offline" banner, a "queued" badge on the Report confirmation, an "SOS queued, will send when connection returns" state in the SOS modal, and a small queue list on the account page.
6. Make sure a queued item is never sent twice (client-generated idempotency key, checked by the server).

Verify: simulate offline (stop the dev server or use the browser tool), queue a report and an SOS, bring the server back, and confirm both arrive once.
STOP and ask Kartik to test with WiFi off.

## Step 12: Incident detail, "My reports" and status management

1. `GET /api/incidents?mine=true` returns only the logged-in user's reports (401 if not logged in).
2. Page `/incidents/[id]`: type, severity, status, description, address, reported time, a small map with the pin, and a "View on map" link. Do not invent a status history, show only what the data has.
3. Organization users see buttons to set the status to "in progress" or "resolved" (the existing PATCH route). Citizens and anonymous users do not see them.
4. Account page: a "My reports" list with status badges, linking to the detail page.
5. Home "Details" buttons and Recent activity items link to the detail page.

Verify with curl (permission rules) and the UI.

## Step 13: Events

Organizations post events (volunteer drives, donation camps). Citizens join them.

1. Model `Event`: title, description, type (`volunteer_drive`, `donation_camp`, `training`, `awareness`, `other`), location (GeoJSON) plus address, startsAt, optional endsAt, optional capacity, organizer (ref User), attendees (refs User), status (`upcoming` or `cancelled`).
2. API: `GET /api/events` (filters type and near; upcoming by default), `POST /api/events` (organization only), `PATCH` and `DELETE /api/events/[id]` (the organizer only; DELETE means cancel), `POST` and `DELETE /api/events/[id]/rsvp` (logged-in users; respect capacity; no duplicate RSVP), `GET /api/events/mine`. Validate everything. Rate limit the POST routes.
3. UI: a new `/events` page added to the sidebar and to the mobile bar or its More menu. Event cards with date, place, spaces left and a Join or Leave button. Type filter chips. Organizations get a "Create event" form.
4. Account page: "My events" (joined events for citizens; hosted events with attendee counts for organizations).

Verify with curl: permission rules, capacity limit, duplicate RSVP, cancel.

## Step 14: Rule-based triage hints

This is NOT AI. Label it "Suggested priority" and never call it AI anywhere in the UI or docs.

1. `lib/triage.js`: pure JavaScript that scores a description from keywords and returns `{ suggestedSeverity, reasons[] }`. Include English terms (trapped, bleeding, unconscious, collapse, drowning, fire, gas, child, elderly, pregnant, no water, stuck) and a few common Hindi or Hinglish words (aag, bachao, baadh, ghayal, phans). List the keywords at the top of the file so Kartik can review them.
2. Report form: as the user types, show a "Suggested priority: High, because it mentions 'trapped'" chip with an "Apply" button. The user stays in control.
3. Server: store `triage: { score, reasons }` on new incidents (add an optional field to the model). Add `sort=priority` to `GET /api/incidents`.
4. Show the reasons on the incident detail page. Works fully offline.

Verify with unit-style checks of the scoring function and a curl test.

## Step 15: Nearest shelter guidance

No routing engine works offline, so be honest: straight-line guidance only.

1. A "Nearest shelter" action on the Map and on shelter cards: pick the nearest open shelter with free spaces to the user's location (haversine).
2. Draw a dashed line on the map and show distance plus compass direction (N, NE, E, and so on). Label it clearly: "Straight-line distance, not a road route".
3. Warn when a shelter is within 2 km of an active high or critical incident ("Near an active incident").
4. If location is unavailable, use the saved account location, otherwise ask the user to allow location.

Verify the distance and direction maths with known coordinates.

## Step 16: Resources and About pages

1. Resources (static, works offline): emergency numbers (only 112, 100, 101 and 108, shown as tap-to-call links), plus short guides for flood, fire, earthquake and basic first aid. Keep guides short and conservative. No medicine doses. Add a visible note: "General guidance. Follow instructions from local authorities." Add a clear `TODO: verify these numbers before the demo` comment and tell Kartik in your report to verify them.
2. About: what RescueNet is, how it works offline, the tech stack, and the known limits (straight-line guidance only, map covers one area, rule-based priority). Do not invent team details. Leave a clearly marked TODO block for Kartik to fill.
3. Consistent styling with the rest of the app.

## Step 17: Security and hardening pass

1. Audit every API route for: auth checks, role checks, input validation, rejecting object values in string fields (NoSQL injection), body size limits, and error messages that do not leak internals.
2. Security headers in `next.config.js`, including a Content-Security-Policy that allows only same-origin resources (allow `blob:` workers and `data:` and `blob:` images where MapLibre needs them). Remove `X-Powered-By`.
3. Make sure the Next.js dev badge does not appear in production builds.
4. Check cookies, JWT secret handling and rate limits again.
5. Run `npm audit` and report the results. Do NOT run `npm audit fix --force`.
6. Search the repo for committed secrets (`JWT_SECRET`, `mongodb+srv`, passwords) and confirm `.env.local` is ignored.
7. Fix what you find, or list what you did not fix and why.

Tell Kartik in your report: an old `.env` containing a MongoDB Atlas URI was committed by a teammate on the `master` branch of this public repo. The Atlas password must be changed in Atlas by hand.

## Step 18: Demo prep (CHECKPOINT)

1. `README.md` (repo root is not editable by rule, so write `docs/README_APP.md`) with exact setup for a fresh laptop: install Node, install MongoDB from the tgz, env file, `npm ci`, seed, regenerate the map file, start commands, and the LAN URL for phones.
2. A seed script `npm run demo:seed` that adds clearly marked demo incidents (all severities, a few resolved) plus two demo accounts (one citizen, one organization) and a few demo events. Local MongoDB only, idempotent, and it prints the demo credentials. Mark everything `seeded: true`.
3. `docs/DEMO_SCRIPT.md`: a 5-minute walkthrough, including the moment where WiFi is turned off and the app keeps working.
4. Final audit: visit every route and every API, run lint and build, run the production build with `next start` on a spare port, and confirm no request leaves localhost on any page. Report exactly what you could and could not verify.
5. List the known limits honestly (in-memory rate limits reset on restart, straight-line guidance only, one-area map, rule-based priority).

STOP and ask Kartik to do a full offline rehearsal on his laptop.

---

## Step 19: Android toolchain (no Homebrew, no Android Studio)

Goal of steps 19 to 22: an Android APK, installable by sideloading, that bundles the UI and the offline map, talks to the laptop server for live data, keeps saved data, and queues reports and SOS.

1. Read the current Capacitor Android docs (`https://capacitorjs.com/docs/android`) and the Capacitor "Environment Setup" page for the required JDK, Android SDK and Gradle versions. Follow what they say today, not what you remember.
2. Download a JDK tarball (not an installer, not Homebrew) and the Android command-line tools into `~/dev`, outside the repo. Verify checksums when the publisher gives them. Report the size of every download.
3. Accept the SDK licences with `sdkmanager --licenses` and install only the packages Capacitor needs (platform-tools, the required `platforms;android-NN`, `build-tools;NN`). Report the disk used.
4. Add Capacitor to `app/` (`@capacitor/core`, `@capacitor/cli`, `@capacitor/android`) and create the Android platform. Use the app id `in.rescuenet.app` unless something is already decided, and the name `RescueNet`.
5. Do not change how the browser version works. `npm run dev`, `npm run build` and `npm start` must behave exactly as before.

Verify: `java -version`, `sdkmanager --list_installed`, `npx cap doctor`, and that `npm run lint` and `npm run build` still pass.

## Step 20: Static mobile build, server address, bearer auth

1. `npm run build:mobile` builds only the UI as a static export for the APK. The export has no API routes in it. The normal `npm run build` is untouched. The mobile build is selected by an environment variable, never by default.
2. The server address is set on a first-run screen and on a Settings page: "Laptop address" (for example `http://192.168.1.6:3000`) with a Test button that calls `/api/health`. Validate and normalise the address (http or https only, no path, no credentials).
3. Routes with dynamic ids (`/incidents/[id]`) get a static-export-friendly form (a query string, such as `/incidents/view?id=...`) in the mobile build only. The browser build keeps its current URLs.
4. Auth for the APK uses a bearer token. The server accepts `Authorization: Bearer <jwt>` in addition to the cookie. Login returns the token in the JSON body only when the client asks for it. The app keeps the token with the Capacitor Preferences plugin and clears it on logout.
5. API calls from the app go through `CapacitorHttp` so plain `http://` to the laptop works. Allow cleartext traffic in the Android project and document the trade-off in `docs/SECURITY.md`.
6. Keep the rate limits and the validation. Do not weaken CORS for browsers: the web build still refuses cross-site writes, and the bearer path must not open a hole in that guard.

Verify: lint, `npm run build`, `npm run build:mobile`, grep the export for `/api` route files, and curl the bearer path (login with and without the token request, a protected route with the cookie, with a bearer, and with neither).

## Step 21: Offline in the app

1. Bundle `app/public/maps/tricity.pmtiles` in the APK assets and read it with a custom PMTiles source, so the map works with the laptop off. If the file is over 150 MB, download it on first run instead, with progress. The `.pmtiles` file is never committed.
2. Save the last responses of incidents, shelters, events and stats in IndexedDB. When the laptop cannot be reached, show the saved data with a "Saved data from <time>, not live" banner. Clear the saved data on logout.
3. Keep the outbox (reports and SOS, sent exactly once, SOS first). It must keep working through the new HTTP layer and the idempotency key must still be sent.
4. Use the Capacitor Geolocation plugin with the proper Android location permission for SOS, reports, and "My location". The browser build keeps using `navigator.geolocation`.

Verify: lint, both builds, unit-style checks of the saved-data and address logic, and a run of the static export in a browser with the server stopped.

## Step 22: Build the APK and docs (CHECKPOINT)

1. `npm run apk` builds a debug APK and copies it to `app/dist/RescueNet.apk`.
2. Do not commit the APK, keystores or the SDK. Stage files by explicit path. Do not edit `.gitignore`.
3. Write `docs/APK_SETUP.md`: install on a phone (allow install from unknown sources, the Play Protect warning), enter the laptop address, start the server with `npm run start:lan`, and the known limits.
4. Add a phone test to `docs/TEST_CHECKLIST.md`.
5. Report honestly what you could NOT verify (no phone or emulator here means the APK has not been run).

Verify: the APK exists and `aapt`/`apksigner` (or `unzip -l`) shows the UI, the map and the manifest permissions.
STOP and ask Kartik to install the APK on a phone and run the phone test. Do not commit Step 22 until he approves.

---

## Step 23: Road data

Goal of steps 23 to 26: real offline road navigation to the nearest shelter. The only time the internet may be used is the one-time road data download in this step. Nothing may touch the internet at runtime.

1. Add `npm run routing:build`. It downloads OpenStreetMap roads for bbox `76.60,30.55,76.95,30.85` (west,south,east,north) ONCE, either from the Overpass API in small chunks that respect fair use, or from a Geofabrik extract. Pick the simplest that works. No API keys.
2. Keep routable highways only. Build a compact graph: nodes at intersections (merge degree-2 nodes into edge geometry), edge length, road class, one-way flags, street name, and flags for walk and drive.
3. Write `app/public/routing/tricity-roads.*` (compact binary or gzipped JSON) plus `meta.json` (build date, counts, bbox). Keep only the largest connected component per profile and report the coverage. Report the file sizes.
4. Add "© OpenStreetMap contributors" on the Map and About pages.

Verify: 10 known place pairs (Chandigarh Sector 17, PGI, Mohali Phase 7, Zirakpur VIP Road, Panchkula Sector 5, and others). Road distance divided by straight-line distance must be between 1.0 and 2.0. Flag every outlier. Also lint and build.

## Step 24: Routing engine

1. `lib/routing/`: load the graph once and cache it (Cache or IndexedDB) so it works offline.
2. Snap the start and end to the nearest road within 300 m, otherwise report "outside coverage".
3. A* with a binary heap and a haversine heuristic.
4. Profiles: `drive` (respects one-ways, excludes pedestrian-only roads) and `walk` (ignores one-ways, excludes motorways).
5. Avoid zones: circles of 200 m around active incidents of type flood, fire or earthquake with severity high or critical. Edges inside a zone get a x10 cost, not a hard block, and the result says if the route still crosses a zone.
6. Run it in a Web Worker.

Verify: unit tests with fixed expected results, and a measurement of the speed. Lint and build.

## Step 25: Navigation UI

1. A "Navigate to nearest shelter" button on `/map`, and a "Navigate" action on each shelter card and popup.
2. Candidates are open shelters with free space. Route to the 3 nearest by straight line and pick the cheapest by route.
3. Draw the route on the map. Show a summary bar with distance, estimated time (labelled clearly as an estimate) and a Walk/Drive toggle.
4. Show a turn-by-turn list built from street names, turn directions and distances.
5. A "Start" mode follows the user's location, highlights the current step, and recalculates when the user is more than 60 m off the route.
6. Warn when the route passes an active incident, and when no safe route exists.
7. If the road graph is missing or the user is outside coverage, fall back to the existing straight-line guidance. When the server is unreachable, use the saved shelter and incident lists.
8. Do not claim traffic data or road closures beyond reported incidents.

Verify: lint, both builds, and the UI in a browser with the server reachable and with it stopped.

## Step 26: Android app and docs

1. Put the road graph into the APK assets and update the APK build. Report the size and ask before including anything over 40 MB.
2. Write `docs/NAVIGATION.md` with the limits (no traffic, no turn restrictions, one-ways may be incomplete, estimates only, closures only from reported incidents) and the regenerate command.
3. Add navigation tests to `docs/TEST_CHECKLIST.md`, including airplane mode and a real walk.
4. Commit only files under 15 MB. For anything larger, commit the build script and docs only. Stage by explicit path and do not edit `.gitignore`.
5. Report what you could NOT verify (real GPS movement, Android, real roads).

Verify: the APK contains the road graph, plus lint and both builds. After Step 26, stop.
