# Road navigation to a shelter: how it works, what it cannot do

RescueNet can give **road directions to a shelter with no internet**. It works out the
route on the phone or laptop itself, from a small file of OpenStreetMap roads that is
saved with the app. This page says exactly what that means, what it does **not** know,
and how to make the road file again.

Paths are relative to `app/` unless they start with `docs/`.

## Read this first: the limits

Say these out loud whenever the feature is shown. They are also in the app (About page,
and under the directions).

| Limit | What it means for you |
| --- | --- |
| **No traffic** | Times assume a constant speed for each kind of road (below). A jam, a market day or a flooded underpass is invisible to it. The app labels every time as an **estimate**. |
| **No turn restrictions** | "No right turn" signs, banned U-turns and similar rules are not in the data, so a route can ask for a turn that is not allowed. |
| **One-ways may be incomplete** | One-way streets are used only where OpenStreetMap says so. A street that is one-way in real life but not tagged will be routed both ways when driving. Walking ignores one-ways on purpose. |
| **Estimates only** | Distances come from the map's road geometry; times from assumed speeds (walking 4.8 km/h; by car 10 to 80 km/h depending on the road type). Real journeys will differ. |
| **Closures only from reported incidents** | The app knows a road is dangerous only because someone reported a **flood, fire or earthquake** (high or critical, not resolved) within 200 m of it. A road blocked for any other reason, or never reported, looks open. |

More limits you should know:

- **Only 8 percent of the roads have a name** in the data for this area (643 of 8,393 km). Many steps therefore say "the road", "the footpath" or "the steps" instead of a street name.
- **Only Chandigarh, Mohali and Panchkula** (the same box as the offline map: `76.60,30.55,76.95,30.85`). A start or end more than **300 m from a mapped road** is "outside coverage" and you get the straight-line guidance instead. Example: the airport terminal's roads are marked private in OpenStreetMap, so they are not used and the terminal is 580 m from the nearest public road.
- **Private roads are left out** (`access=private`, `no`, and similar), and so are parking aisles. Farm tracks and footpaths are walkable but **never used by cars**.
- **Walking uses roads too**, including main roads that have no pavement. Motorways and expressways (`motorroad=yes`) are excluded. Steps are allowed and counted as slower.
- **Barriers are not read** (gates, bollards). **Hills, surface, width and lighting are not read.**
- **"Start" only works while the app is open and the screen is on.** There is no background tracking and no spoken directions. Keep the phone awake while walking.
- **GPS can be wrong by tens of metres**, more between tall buildings. A fix with an accuracy worse than 100 m is ignored when deciding whether you left the route.
- **Nothing says a route is safe.** "No route that avoids reported danger was found" means exactly that. The app never claims safety.

## What the person sees

On the **Map** page:

- **Navigate to nearest shelter**: finds your position, then the **3 nearest open shelters with a free space** (straight line), routes to each, and picks the cheapest by road. A full or closed shelter is never a candidate.
- **Navigate** on a shelter's **popup** (tap its marker) and on every shelter **card** on the Shelters page (it opens `/map?navigate=shelter:<id>`). This goes to that shelter even if it is full or closed, and says so.
- The route is drawn in blue, with the amber rings of the danger zones around active floods, fires and earthquakes.

While a route is on screen the map is laid out like a navigation app, built for a 360 x 740 phone:

- **An instruction card** flush with the top of the map: an icon, the next instruction (two lines at most) and how far away it is.
- **A slim strip** flush with the bottom: the destination on one line (an ellipsis if it is long), the **distance**, the **estimated time** (always marked "Estimate · … · no live traffic"), the **Walk / Drive** switch, **Start** and **Stop**, an amber count when there are warnings, and a **chevron**.
- **The map in between.** The filter chips, the legend and "Navigate to nearest shelter" are hidden while a route is on screen and come back on **Stop**. One round button on the right edge above the strip is **My location**, and it becomes **Re-centre on me** when "Start" is following you and you have dragged the map away.
- **Collapsed by default.** The chevron opens the **directions** as a sheet that takes at most 45% of the screen and scrolls inside itself: the warnings first, then the turn-by-turn list built from street names, turn directions and distances. Escape closes it.
- **Start** follows your position: the card shows the next turn, the current step is highlighted in the list, the map keeps you in view (drag it to stop; the round button brings it back), and it **recalculates** when you are **more than 60 m off the route**. It needs two off-route fixes in a row and waits 8 seconds between recalculations, so one noisy GPS reading does not send you on a detour. "You are off the route" is a small banner under the card, and goes away when the new route arrives. Within 25 m of the end it says you have arrived.
- **Warnings** (amber): the route passes an active incident (any type, within 150 m), the route still crosses a danger zone ("No route avoids reported danger. Tap for details" under the card, the full text in the sheet, with "call 112"), or the shelter is full or closed.
- **Fallbacks.** If the road file is missing or damaged, or you are outside the mapped area, or no road route exists, the panel says why and shows the existing **straight-line distance and direction** with its dashed line ("Straight-line distance, not a road route").
- The **Nearest Shelter** tile on Home and "Navigate on the map" on the Shelters page open the map and start the same directions.
- "© OpenStreetMap contributors" is shown on the map and on the About page. During navigation it moves up to sit just above the strip (on a laptop screen the strip is a card at the left, so it stays at the bottom right).

The layout keeps the app's tab bar and the red SOS button reachable. The bars use the phone's safe-area insets (`--safe-area-inset-*`, which Capacitor injects, or `env(safe-area-inset-*)`) at the left, right and bottom. Today those are 0, because the app does not use `viewport-fit=cover` and Android pads the WebView itself.

### Checking the phone layout

`docs/screenshots/step-27/` has the screenshots and the measurements for 360 x 740, 390 x 844 and 412 x 915 (what the strip and card measure, how much map is left, that nothing overlaps or is clipped). To measure it again:

```sh
npm run build && npm run start:lan     # the production server, with the demo data (npm run demo:seed)
npm run check:phone                    # http://localhost:3000; or: npm run check:phone -- http://localhost:3110 --shots ~/Desktop/shots
```

It opens headless Chrome (Google Chrome at the usual Mac path, or `CHROME_PATH`), fakes a position in Sector 17, and runs 123 checks with `getBoundingClientRect()`. It is a real browser engine at phone sizes, not a phone.

## How it works, with no internet

1. **The road file.** `public/routing/tricity-roads.rnrg` (1.4 MB) plus `meta.json`. It holds 67,478 junctions and 90,892 road pieces ("edges") with their shape, length, road type, one-way flag, street name and whether people on foot and cars may use them. It is built once from OpenStreetMap (below). The format is documented at the top of `lib/routing/format.js`.
2. **Saved on the device.** The first time the map opens with the server reachable, the road file is saved in the browser's IndexedDB (`lib/routing/graphStore.js`). After that it is read from there, and it is fetched again only if `meta.json` shows a new checksum. In the Android app the file is inside the APK, so it is there from the first launch.
3. **A Web Worker does the work** (`lib/routing/routing.worker.js`), so searching never freezes the screen. If the browser cannot start a worker the same code runs on the main thread.
4. **Snapping.** Your position and the shelter are snapped to the nearest road **line** (not just the nearest junction) within 300 m, so a route can start or end part-way along a road.
5. **Search.** A* with a binary heap and a straight-line (haversine) estimate (`lib/routing/engine.js`). The cost is **estimated travel time**.
6. **Profiles.** *Drive* obeys one-ways and uses only roads cars may use. *Walk* ignores one-ways and excludes motorways.
7. **Danger zones.** A circle of 200 m round every active (not resolved) **flood, fire or earthquake** incident of **high or critical** severity. A road piece that comes within a zone costs **10 times as much**. It is never blocked, so a route can still go through when it is the only way, and the result then says which zones it crosses.
8. **Directions.** `lib/routing/instructions.js` joins road pieces that are the same road into steps and turns bearings into "turn left", "bear right", "U-turn", "roundabout".

Assumed speeds (used for the cost and the time estimate):

| By car (km/h) | | On foot (km/h) | |
| --- | --- | --- | --- |
| motorway 80, trunk 50 | primary 40, secondary 35 | most roads and paths 4.8 | tracks and paths 4 |
| tertiary 30 | unclassified and residential 25 | steps 3 | |
| service roads 15 | living streets 10 | | |

Nothing in this feature touches the internet while the app runs: no map service, no routing service, no analytics. The server is used for the incident and shelter lists, not for routes.

## When the server cannot be reached

- **Android app:** directions use the **saved shelter and incident lists** (the amber "Saved data from <time>, not live" banner is shown). The road file is in the app. So with the laptop off, even in airplane mode, "Navigate to nearest shelter" still works, using the shelters and incidents as they were when the phone last saw them. Treat the shelter capacity as old.
- **Website:** the website keeps no saved lists (a deliberate choice from Step 21). Directions keep working while the page stays open, using the lists already loaded. After a reload with the server down there are no shelters to navigate to.

## Making the road file again

You only need this to **refresh the roads** (OpenStreetMap changes every day) or for a different area. It is the **only step that uses the internet**: it downloads a regional OpenStreetMap extract once.

```sh
cd ~/Documents/Desktop/RescueNet/app
npm run routing:build
```

- It downloads the Geofabrik extract "India, northern zone" (about **214 MB**) to `~/dev/osm-cache/northern-zone.osm.pbf` (outside the repo), checks Geofabrik's MD5, and keeps it. The next run reuses it and downloads nothing.
- It then reads the roads inside the box, builds the graph, and writes `public/routing/tricity-roads.rnrg` and `public/routing/meta.json` (build date, counts, bounding box, coverage, checksum). It takes about 20 seconds.
- **Options:** `npm run routing:build -- --no-download` (fail rather than download), `-- --pbf some.osm.pbf` (use a file you already have), `-- --cache-dir DIR`. To get a newer extract, delete `~/dev/osm-cache/northern-zone.osm.pbf` first.
- The public Overpass API was tried first and refuses automated queries, so it is not used.
- Different area: change `BBOX` in `scripts/build-routing.mjs` (and make the map file for the same box: `docs/OFFLINE_MAP.md`), and the matching numbers in `components/map/mapConfig.js`.

Then check and rebuild:

```sh
npm run check:routing      # the data: rules, format, hand-made map, 13 known place pairs
npm run check:engine       # the routing engine, the offline cache, the worker
npm run check:navigation   # turn-by-turn, following a route, warnings
npm run build              # the website
npm run apk -- --offline   # the Android app (see docs/APK_SETUP.md)
```

`check:routing` measures road distance against straight-line distance for 13 known place pairs (Chandigarh Sector 17, PGIMER, Mohali Phase 7, Zirakpur VIP Road, Panchkula Sector 5, the railway station, Pinjore, Kharar, Dera Bassi and others), for walking and driving: it must be between 1.0 and 2.0. With the current data the 22 routes it can test range from **1.09 to 1.53**, and two places are reported "outside coverage" (the airport terminal and the middle of Sukhna Lake: no public road within 300 m).

### Which files go in git

The road file is 1.4 MB, so it is committed (a fresh laptop needs no internet to use directions). The extract (214 MB) is **never** committed: it lives in `~/dev/osm-cache`. Rule of thumb used here: commit generated data under 15 MB; for anything bigger, commit only the build script and this page.

## What is in the data (current build)

From `public/routing/meta.json`:

| | |
| --- | --- |
| Source | OpenStreetMap, Geofabrik extract `asia/india/northern-zone`, dated 2026-10-24 |
| Junctions and road ends | 67,478 |
| Road pieces | 90,892 (all walkable, 86,754 drivable), 154,316 shape points |
| Street names | 150 distinct |
| Walking network kept | 8,393 km of 8,481 km found (99.0%), the biggest connected piece (324 separate pieces were dropped) |
| Driving network kept | 7,818 km of 7,896 km found (99.0%), the biggest strongly connected piece, so every kept place can be reached from every other obeying one-ways (246 pieces dropped) |
| Map cells with a road | 971 of 1,116 one-kilometre cells for walking, 962 for driving |
| File size | 1.4 MB (the extract it comes from: 214 MB) |

## Speed

Measured in Node on this Mac: reading the file 27 ms, building the search index 71 ms, then a route takes **1.8 ms in the middle and 6.5 ms at worst** (22 routes, up to 22 km). In headless Chrome with a real Web Worker: a 14 km drive route takes about 4 ms from the page's point of view. A phone will be several times slower. **Not measured on a phone.**

## Where the code is

| What | File |
| --- | --- |
| Build the road file | `scripts/build-routing.mjs`, `scripts/routing/` (reader, rules, graph builder) |
| File format | `lib/routing/format.js` |
| Engine (snap, A*, zones) | `lib/routing/engine.js`, `geometry.js`, `zones.js`, `constants.js` |
| Worker, client, offline copy | `routing.worker.js`, `service.js`, `client.js`, `graphStore.js` |
| Directions, following, warnings | `instructions.js`, `follow.js`, `navigation.js` |
| Screens | `components/navigation/` (`useNavigation.js`, `NavigationPanel.js`, `routeLayers.js`), `components/map/MapView.js` |
| Location while walking | `lib/devicePosition.js` (browser), `mobile/overlay/lib/devicePosition.js` (Android) |

## Licence

Road data © OpenStreetMap contributors, available under the Open Database Licence (ODbL 1.0). The credit is on the map and on the About page. If you publish a derived road file, the licence's share-alike rules apply to it.
