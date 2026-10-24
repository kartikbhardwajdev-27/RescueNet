# RescueNet: hand-test checklist

Everything you must try yourself once the whole app is built, in the order that
matters most for the demo. Tick a box only when you saw the expected result.

**Status labels** (what I did, not what you should believe):

- **Automated check: passed** means I ran it in a real headless Chrome or with
  curl in this build session and it did what the "Expected" line says.
- **Automated check: not run** means I did not test it automatically.
- **Not verified at all** means nothing I have can test it (a real phone, your
  real WiFi switch, your own eyes).

"Automated" never means a person tried it. The hand test is still yours.

## Where to run things

- **mongod tab**: the terminal where `mongod` runs (leave it alone). If it is not
  running: `~/mongodb/bin/mongod --dbpath ~/data/db`.
- **app server tab**: the terminal that runs the app. For the tests below it must
  run the **production** build (the offline features only work there):
  stop any `npm run dev` with Ctrl+C, then
  ```sh
  cd ~/Documents/Desktop/RescueNet/app
  npm run build
  npm run start:lan
  ```
  The app is then at `http://localhost:3000`.
- **new tab**: open a third terminal tab for one-off commands (`cd ~/Documents/Desktop/RescueNet/app` first).

## Accounts

Until `npm run demo:seed` exists (Step 18) use your own two accounts, or register
new ones at `/register`:

- **Citizen**: any citizen account.
- **Organization**: an account registered with the role Organization (type NGO,
  govt or volunteer group).

---

## 1. Offline map with WiFi off (Step 10)

- [ ] **1.1 The map works with no internet.**
  1. app server tab: production server running (see above).
  2. Chrome: open `http://localhost:3000/map`. You should see a dark street map of
     Chandigarh, Mohali and Panchkula, green house-shaped shelter markers, and
     any active incidents (amber, orange or red dots).
  3. Turn the Mac's WiFi **off** (menu bar).
  4. Refresh the page (Cmd+R).
  5. Click a green shelter marker.
  - **Expected:** the map still draws streets and labels, the markers are still
    there, the popup shows the shelter name, a capacity bar and its status. The
    Incidents and Shelters chips hide and show markers.
  - **Expect these to fail with WiFi off (not a bug):** "My location" may say it
    cannot find you, because a Mac finds its location through WiFi.
  - If you see "Offline map tiles are missing": the map file is not on this
    laptop. Regenerate it with the command in `docs/OFFLINE_MAP.md` (new tab).
  - Turn WiFi back on afterwards.
  - Account: none needed.
  - **Automated check: passed** for everything except the WiFi switch itself:
    headless Chrome loaded `/map`, every network request stayed on localhost, the
    map file answered with 206 range responses, the markers and popups appeared,
    the Shelters chip hid the shelters, and the same worked at phone size.
    **Not verified at all:** the real WiFi switch on your Mac.

- [ ] **1.2 "View on map" links open the right popup.**
  1. On Home or Shelters, click a "View on map" or "Open map" link.
  - **Expected:** the map flies to that item and opens its popup. Active
    incidents and shelters only: a **resolved** incident is not drawn, so its link
    shows a small notice "That incident isn't on the map any more" (by design).
  - **Automated check: passed** (deep links for a shelter and an active incident).

## 2. Offline queue: report and SOS with the server down (Step 11)

- [ ] **2.1 Queue a report and an SOS, then reconnect.**
  1. app server tab: production server running. In Chrome open
     `http://localhost:3000`, click through Home, Report, Map, Shelters, Events,
     Resources, About and Account once each (this is when the pages are saved on
     your computer). Wait about 10 seconds.
  2. app server tab: press **Ctrl+C** to stop the server.
  3. Within a few seconds an amber **"You're offline"** pill appears.
  4. Report page: fill a report (pick a type, a description, and type coordinates
     `30.73` and `76.78`), press **Submit report**.
  5. Press the red **SOS** button, then **Send**.
  6. Open **Account**. (While the server is down it may say your account can't be
     loaded right now; the saved-items list is still shown.)
  7. Reload the page (Cmd+R).
  8. app server tab: start the server again (`npm run start:lan`).
  - **Expected:** step 4 shows a panel "Report queued" with a **Queued** badge.
    Step 5 says "SOS queued. It will be sent when the connection returns." Step 6
    lists both under **Saved on this device**. Step 7: the page still opens and the
    items are still listed. After step 8, within a few seconds the pill goes away,
    a toast says they were sent, both show **Sent**, and the SOS was sent first.
    Open Home or the map: **one** report and **one** SOS exist, not two.
  - Account: citizen.
  - **Automated check: passed** (headless Chrome: service worker active, app
    shell saved, server stopped, pill shown, `/report`, `/`, `/map`, `/shelters`,
    `/events` still opened, a report and an SOS queued, both survived a reload,
    and after the server came back exactly 1 report and 1 SOS arrived, the SOS
    first, each with the time the button was pressed).
    **Not verified at all:** your own hands and your own browser profile.

- [ ] **2.2 WiFi off, server still running.**
  1. app server tab: production server running.
  2. Turn WiFi **off**.
  3. Use the app: Home, Report, Shelters, Events.
  - **Expected:** a **blue** pill says there is no internet but RescueNet runs on
    its own server; everything works, and reports send normally.
  - **Automated check: not run** (I cannot switch your WiFi). What I did check:
    no page makes a single request outside localhost, so the internet being gone
    cannot change anything.

## 3. Phone on the laptop's network (Step 11 and the cookie fix)

- [ ] **3.1 Open the app on a phone.**
  1. new tab: `cd ~/Documents/Desktop/RescueNet/app && npm run lan:url` prints the
     address, for example `http://192.168.1.6:3000`. (It changes if your WiFi
     changes.) The app server tab must be running `npm run start:lan`.
  2. Put the phone on the **same WiFi** as the laptop, or on the laptop's
     hotspot. Type that address into the phone's browser.
  3. Browse Home, Shelters, Map, Report.
  4. **Log in** with your citizen account on the phone.
  5. Submit a report with coordinates typed by hand.
  - **Expected:** pages, map and shelters work. Login **works and stays logged
    in** (this was broken before I fixed it this session: the login cookie was
    thrown away over plain http). Reports send.
  - **Expected limits (not bugs):** "Use my location" and the SOS location do not
    work over plain `http://<ip>` (browsers forbid it); an SOS from a phone needs a
    saved account location. There is no offline page cache and no "Add to Home
    Screen" over plain http. A queued report is still sent when the connection
    returns **while the page stays open**.
  - **Automated check: passed** for the part I can reach: Chrome on the laptop
    using the laptop's own LAN address `http://192.168.1.6:3100` could register,
    stay logged in and use the app.
    **Not verified at all:** a physical phone.

## 4. Organization changes an incident's status (Step 12)

- [ ] **4.1 Organization sets in progress and resolved.**
  1. Log in as the **organization** account. Open Home and click **Details** on
     an incident (or open one from Recent activity).
  2. Press **Mark in progress**, then **Mark resolved**.
  3. Log out. Log in as a **citizen** and open the same incident.
  - **Expected:** the badge changes to "Response in progress", then "Resolved",
    and the buttons say "Currently ...". The citizen sees the incident and its
    status but **no** buttons, and an anonymous visitor does not either. A
    resolved incident disappears from the map.
  - Account: organization, then citizen.
  - **Automated check: passed** (curl: anonymous 401, citizen 403, organization
    200, invalid or extra fields 400, unknown id 404; headless Chrome clicked both
    buttons and the status stuck on the server).

- [ ] **4.2 "My reports".**
  1. Log in as a citizen, make a report, open **Account**.
  - **Expected:** a **My reports** list with status badges. Clicking one opens its
    page, with a small map and a "View on map" link.
  - **Automated check: passed.**

## 5. Events (Step 13)

- [ ] **5.1 Organization creates an event, citizens join and leave.**
  1. Log in as the **organization**. Open **Events** (sidebar; on a phone it is in
     the top-right menu). Press **Create event**, fill it in (pick a start time
     in the future, set a capacity of 2), save.
  2. Log out. Log in as a **citizen**. Open Events, press **Join** on it.
  3. Open **Account**: under **My events** it should be listed.
  4. Back on Events press **Going · Leave**.
  5. Log in as the organization again, open Account.
  - **Expected:** the card shows the date, place and "N spaces left". After Join
    the button reads "Going · Leave" and the count drops; after Leave it returns.
    A citizen has no Create event button. The organization sees **Hosting** on its
    own event, how many people joined, and a **Cancel event** button that asks
    first; a cancelled event disappears from the list but people who joined still
    see it as cancelled under My events. With capacity 2, a third person gets
    "This event is full".
  - Account: organization and citizen (two different citizens to try the limit).
  - **Automated check: passed** (curl: 57 checks of permissions, validation,
    capacity, duplicate join, leave, cancel and a 5-way race for one space;
    headless Chrome joined, left, opened the Create form).
    **Not verified at all:** filling in and saving the Create event form by hand
    (I created events by API and only opened the form).

## 6. Suggested priority (Step 14)

- [ ] **6.1 The chip on the report form.**
  1. Open **Report Incident**. Leave severity on **Medium**.
  2. In "Describe what you see" type: `Two people trapped, one bleeding`.
  3. Press **Apply** on the blue chip.
  4. Replace the text with `Quiet street, nothing special`.
  5. Pick **Critical**, then type `there is a child here`.
  6. Type `बचाओ, हम फंस गए हैं`, then `aag lagi hai`.
  - **Expected:** step 2: "Suggested priority: Critical, because it mentions
    'trapped' and 'bleeding'" with an Apply button. Step 3: Critical is selected
    and the chip becomes a quiet "matches your choice" line. Step 4: no chip.
    Step 5: no chip (it never tells you to go **down**). Step 6: chips for the
    Hindi and Hinglish words. Nothing ever changes without pressing Apply.
  - Account: none needed. Works with the server off too.
  - **Automated check: passed** (headless Chrome, 15 checks; `npm run check:triage`
    runs 220 checks of the scoring rules).

- [ ] **6.2 The reasons on the incident page.**
  1. Submit the report `Gas leak in the building, child inside` and open it.
  - **Expected:** a blue "Suggested priority" note: High, "because the description
    mentions 'gas leak' and 'child'". Older incidents show no note.
  - **Automated check: passed.**

- [ ] **6.3 Review the keyword list.** Open `app/lib/triage.js` (top of the file)
  and read the words and weights. Tell me anything to add or remove.
  - **Not verified at all:** whether the words suit your region.

---

## Not finished

Nothing so far.

## Things I changed that you did not ask for

- **Login cookie fix (`lib/auth.js`).** Found while re-checking Step 11: in a
  production build the login cookie was marked `Secure`, which browsers discard
  over `http://<laptop-ip>`, so login on a phone silently failed. It is now `Secure`
  only when the request was https. Committed separately.
