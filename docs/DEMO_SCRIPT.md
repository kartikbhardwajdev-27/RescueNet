# Demo script: 5 minutes

**The point to land:** RescueNet keeps working when the internet is gone, because
everything runs on one laptop. Nothing leaves the laptop.

## Before you start (do this 10 minutes ahead)

1. **mongod tab** running; **app server tab** running the production build
   (`npm run build`, then `npm run start:lan`). New tab:
   `curl localhost:3000/api/health` says `"db":"connected"`.
2. **Reset the scene:** `npm run demo:seed` (new tab, inside `app/`). Fresh times,
   original statuses. Reports you made by hand in earlier rehearsals stay; on a
   demo-only database (`rescuenet_demo`) `npm run demo:wipe` then `npm run demo:seed`
   gives a spotless start (see `README_APP.md`).
3. **Two browser windows, so you never log in and out on stage:**
   - Normal Chrome window: log in as the **citizen** (`demo.citizen@rescuenet.test`).
   - Incognito window: log in as the **organization** (`demo.org@rescuenet.test`).
   - Password for both: `demo-rescuenet-2026`.
   - Both on `http://localhost:3000` (not the LAN address: location and saved
     pages need `localhost`).
4. In the citizen window allow **location** for localhost once (the padlock in the
   address bar), and visit Home, Map, Report, Shelters, Events, Resources, About
   once so the pages are saved on the laptop.
5. Wait 10 seconds. Turn **notifications off** and close other apps.
6. Optional: a phone on the laptop's hotspot at the address from `npm run lan:url`.

## The walk-through

| Time | Window | Say and do |
| --- | --- | --- |
| **0:00** | citizen, **Home** | "RescueNet is a disaster-response app for Tricity. This is the live picture: active incidents, resolved today, shelters open, spaces free. All of it comes from a database on this laptop." Point at Recent activity (the red **SOS** at the top). |
| **0:40** | **Map** | "The street map is a 4 MB file on this laptop, not a map service." Click the red pulsing marker: an SOS. Click a green shelter: capacity bar. Toggle the **Incidents** and **Shelters** chips. |
| **1:20** | **Report** | Type: `Two people trapped on the first floor, one is bleeding`. "As I type it suggests a priority from simple keyword rules, and says which words." Press **Apply** (it becomes Critical). "A person stays in charge." Press **Use my location**, submit. Toast with a reference. |
| **2:00** | **Map** | Press **Navigate to nearest shelter**. "It picks the closest shelter that is open and has space, then works out a real road route on this device, with no internet." Point at the blue route, the distance, and the time: "**an estimate**, no live traffic". Press **Drive**, then **Walk**. Open **Directions** for the turn-by-turn list. "It steers round roads near reported floods, fires and earthquakes (the amber rings), and tells you when it cannot." It also warns when a shelter is near an active serious incident: from the citizen's saved location the nearest shelter is Mohali Phase 7, which has an amber **Near an active incident** badge because of the market fire next to it. |
| **2:45** | **Offline moment** | "Now the point of the whole thing." Turn the Mac's **WiFi off** (menu bar). Press Cmd+R on the map. "No internet. The map still draws, the markers are still there, the reports still work." Point at the blue **pill**: no internet, RescueNet runs on its own server. Keep WiFi off for the next step. |
| **3:15** | organization (Incognito) | Open an incident on Home, **Details**. Press **Mark in progress**, then **Mark resolved**. "Only organizations can do this; a citizen sees the status but no buttons." Show it vanish from the map. |
| **3:50** | **Events** | Create an event (or show the existing ones): "volunteer drive, 30 places". In the citizen window press **Join**; show **spaces left** change; first-aid training has only 2 places. |
| **4:30** | **Resources** and **About** | "Emergency numbers are tap-to-call, and the guides work offline." Open **About**: "and here is exactly what it does **not** do": no live traffic, one area, rule-based priority. Turn **WiFi back on**. |
| **5:00** | | Stop. Questions. |

## Optional: the harder offline moment (rehearse it first)

Instead of switching WiFi off, **stop the server**: in the app server tab press
**Ctrl+C**. In the citizen window the amber **"You're offline"** pill appears.
Make a report and press **SOS**: the report says **Queued**, the SOS says "SOS
queued. It will be sent when the connection returns." Start the server again
(`npm run start:lan`). Within a few seconds the pill goes, both show **Sent**, and
the SOS was sent first. Say: "nothing is lost, and nothing is sent twice."

## If something goes wrong

- **The map is blank:** the map file is missing. Say the rest of the demo works
  without it, and show Shelters instead.
- **"Use my location" fails:** type coordinates `30.7398` and `76.7827`
  (Sector 17), or use the citizen account's saved location with **Nearest
  shelter**.
- **A page looks old:** press Cmd+Shift+R once while the server is up.
- **Scene is messy after rehearsing:** `npm run demo:seed` puts it back.
- **Short on time:** drop Events and the optional queue moment. Keep Map, Report,
  Nearest shelter, and the WiFi-off refresh.

## Things not to claim

- That it works on a phone without WiFi to the laptop: it needs the laptop's
  network (WiFi or hotspot), just not the internet.
- That the priority is clever: it is keyword rules.
- That the directions know about traffic or closed roads: they do not. Times are estimates, and
  closures are known only from incidents someone reported (`NAVIGATION.md`).
- That it works outside Chandigarh, Mohali and Panchkula: there it falls back to a straight line.
- That reports are verified: nobody checks them.
- That phones get location over plain http: they do not (see
  `OFFLINE_APP.md`).
