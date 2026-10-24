# Nearest shelter

Press **Nearest shelter** on the Map (or on the Shelters page) and RescueNet
picks the closest shelter that is **open and has free spaces**, and tells you how
far it is and which way to head.

It is **straight-line guidance only**. No routing engine runs on this laptop and
none could work offline, so there are no roads, turns or travel times. Every
screen says so: "Straight-line distance, not a road route."

All paths are relative to `app/`. The maths is in `lib/nearest.js`.

## How it works

1. **Where you are.** In this order: the browser's location (if the browser
   allows it), else the location saved on your account (set at sign up with "Use
   my location"), else the screen asks you to allow location and offers Try again.
   When the saved location is used the screen says so.
2. **Which shelter.** Every shelter whose status is "open" and whose occupied count
   is below its capacity is a candidate. Full and closed shelters are skipped, even
   if they are closer. The nearest by great-circle (haversine) distance wins; an
   exact tie goes to the lower id so the answer never depends on list order.
3. **Which way.** The initial great-circle bearing, shown as one of eight compass
   points (N, NE, E, SE, S, SW, W, NW). Within about 20 m it just says you are there.
4. **Warning.** If an active (not resolved) incident of **high or critical**
   severity is within **2 km of the shelter**, the shelter is marked "Near an
   active incident" with how far the nearest one is. It is a warning, not a ban:
   the shelter is still the nearest one.
5. **Staying current.** The answer is recomputed whenever the shelter and incident
   lists refresh (every 30 seconds), so a shelter that fills up stops being
   recommended. The camera only moves when you press the button.

## Where it shows

| Place | What you see |
| --- | --- |
| Map | A **Nearest shelter** button beside "My location". A dashed green line from you to the shelter with "7.3 km SW" on it, a ring around that shelter's marker, and a panel with the name, spaces free, the note and any warning. |
| Map popups | A shelter's popup shows "Near an active incident" when that applies, whether or not you pressed the button. |
| Shelters page | A **Nearest shelter** button. The matching card gets a green outline and "Nearest open shelter", the page scrolls to it, and every card shows the direction next to its distance ("7.3 km away · SW") and the incident warning. "Show the line on the map" opens `/map?nearest=1`, which runs the search by itself. |

## Check it

```sh
npm run check:nearest   # 88 checks: distance, bearing, compass, which shelter, the 2 km rule
```

The expected values are published or hand-worked numbers (London to Paris is
343.5 km at about 148 degrees; one degree along the equator is 111.19 km; a 10
degree step east along 60 N starts at 85.67 degrees), not outputs of the code.

## Limits

- Straight line only. A shelter 2 km away across a river or a railway may be a
  long way round. Local knowledge beats this line.
- The location comes from the browser, which needs https or `localhost`. On a
  phone at plain `http://<laptop-ip>` the browser refuses location, so a phone
  needs a saved account location (see `docs/OFFLINE_APP.md`).
- The incident warning only knows incidents that were reported. No report, no
  warning.
- Capacity numbers are whatever the organization last entered.
