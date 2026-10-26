# Step 27: the navigation layout on a phone

Screenshots from headless Chrome (a real browser engine, not a phone) at the three sizes
Step 27 names, with the demo data and a faked position in Sector 17. Taken by
the check that measures them: every number below came from `getBoundingClientRect()` in that
same run. Re-make them with `npm run check:phone` (see `docs/NAVIGATION.md`, "Checking the phone
layout").

| Size | Collapsed panels (card + strip) | Free map between them | The sheet open |
| --- | --- | --- | --- |
| 360 x 740 | 191 px = **25.7%** of the screen (card 52 + strip 139) | 340 px = **63.8% of the map's height**, 45.9% of the screen | 333 px = 45.0% |
| 390 x 844 | 188 px = **22.3%** (card 49 + strip 139) | 446 px = **70.1%** of the map, 52.8% of the screen | 380 px = 45.0% |
| 412 x 915 | 188 px = **20.5%** (card 49 + strip 139) | 517 px = **73.1%** of the map, 56.5% of the screen | 412 px = 45.0% |

With the small "You are off the route" banner added the panels use 29.3%, 25.7% and 23.4%.
"The map keeps 50% of the height" is met against the map's own height at all three sizes. Against
the whole screen it is met at 390 and 412 and **not at 360 x 740 (45.9%)**: on that phone the
app's own top bar and tab bar already take about a quarter of the screen.

## What each picture shows

- **`360x740-idle-no-route`**: before any route. The map with the incidents and shelters, one
  wide "Navigate to nearest shelter" button (one line) with the round "My location" button
  beside it, and under them one card with the two filter chips on one row and the legend. The
  OpenStreetMap credit is at the bottom right. Nothing overlaps.
- **`*-route-collapsed`**: a route is on screen, nothing opened. At the top, flush with the map:
  one card with a direction icon, the next instruction (at most two lines: "Head west along the
  footpath") and its distance ("110 m"). At the bottom, flush with the map: a strip with the
  destination on one line (an ellipsis when it is too long: "DEMO: Mohali Phase 7 Sc…"), an amber
  warning count, a chevron, the distance and time ("8.7 km · ≈ 1 h 49 min" with "Estimate · on
  foot · no live traffic" under it), the Walk/Drive switch, and a wide **Start** with **Stop**.
  Between them the map, with the blue route, the amber danger rings and the round locate button
  on the right edge just above the strip. The credit sits at the bottom left, above the strip.
  The filter chips, the legend and "Navigate to nearest shelter" are gone. The tab bar and the red
  SOS button below are untouched.
- **`*-directions-sheet-open`**: after tapping the chevron. The strip grows upward into a sheet
  that takes 45% of the screen at most; inside it the warnings and the list of steps, which
  scrolls on its own. The instruction card stays at the top and the tab bar is still reachable.
- **`*-following`**: after Start. The card now shows the next turn and the distance to it
  ("Turn right onto the road", "90 m"); the strip's Start is replaced by one full-width **Stop**;
  the map is zoomed in on the blue dot with the current step drawn in white.
- **`*-off-route-banner`**: the person has left the route. A small amber pill, "You are off the
  route", sits under the instruction card (about 31 px high). It disappears when the new route
  arrives.
- **`desktop-route-with-directions`**: the same layout on a laptop screen. The card and the strip
  sit at the left of the map, so the OpenStreetMap credit stays visible at the bottom right.
