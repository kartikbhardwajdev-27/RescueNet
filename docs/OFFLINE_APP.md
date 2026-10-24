# Offline app and LAN access

RescueNet's server runs on the laptop. "Offline" here means **no internet**, not
no server: phones and laptops reach the app over the laptop's own WiFi or
hotspot, and nothing in the app needs the internet.

Two separate things keep the app useful when connections fail:

| Piece | What it does | Needs |
| --- | --- | --- |
| **Offline outbox** (`lib/outbox.js`) | Reports and SOS are saved on the device first, then sent. If the server cannot be reached they wait and are sent when it can. Nothing is sent twice. | Works everywhere, including plain `http://<laptop-ip>` |
| **Service worker** (`public/sw.js`) | Saves the pages and their code on the device, so the app opens when the server cannot be reached. | A secure origin: `https://...` or `localhost` |

All paths are relative to `app/`.

## Run it so phones can open it

```sh
npm run build        # once, and again after any code change
npm run start:lan    # production server on every network interface (next start -H 0.0.0.0)
npm run lan:url      # just print the addresses
```

`start:lan` prints the address to type into the phone, for example
`http://192.168.1.6:3000`. The phone must be on the same WiFi, or on the
laptop's hotspot. It does not need internet.

Use the **production** build for anything offline. In `npm run dev` the service
worker is switched off on purpose (see below), so only the outbox works.

## What works where

Verified means I ran it in a real Chrome against this app. The "phone" column is
what a phone browser sees at `http://<laptop-ip>`: that is a **non-secure
origin**, and I tested exactly that condition by opening the laptop's own LAN
address (`http://192.168.1.6:3101`) in Chrome. I have **not** tested on a
physical phone.

| | `localhost` (the laptop) | `http://<laptop-ip>` (a phone) | `http://<laptop-ip>` + Chrome "treat as secure" |
| --- | --- | --- | --- |
| Pages, map, shelters, reports | works | works (verified) | works (verified) |
| Offline outbox (queue + retry + once-only delivery) | works (verified) | works (verified) | works (verified) |
| Service worker, pages open with the server down | works (verified) | **no**: browsers do not offer service workers here (verified) | works (verified) |
| Location ("Use my location", SOS) | works | **no**: refused on non-secure origins (verified) | works (verified) |
| Install / Add to Home Screen as an app | should work: the manifest, icons and service worker are valid (verified), but I did not try the install prompt itself | **no**: browsers require a secure origin for this (not tested) | not tested |

What that means in practice for a phone on plain `http://<laptop-ip>`:

- Reports and SOS **do** work and are saved and re-sent if the connection drops
  while the page is open. Verified: queued while the server was down, delivered
  exactly once when it came back.
- If the server is down and the page is **reloaded**, the browser shows its own
  "can't be reached" page (no service worker to answer). Keep the page open.
- **Location does not work.** An SOS needs a location, so on plain http an
  anonymous SOS fails with "Couldn't get your location". A logged-in person whose
  account has a saved location can still send an SOS (it uses the saved one). The
  report form still works: enter the coordinates by hand.

**Logging in over plain http.** The login cookie used to be marked `Secure`
whenever the app ran in production mode. A browser throws a `Secure` cookie away
when it arrives over plain `http://<laptop-ip>`, so on a phone registering or
logging in *looked* like it worked and the very next request was anonymous
(verified with Chrome against the laptop's LAN address: `/api/auth/me` answered
401). The cookie is now `Secure` only when the request really was https
(`lib/auth.js`: the last `x-forwarded-proto` entry, which a reverse proxy adds, or
`COOKIE_SECURE=true` in the environment to force it). Verified: logging in now
works on `http://localhost` and on `http://<laptop-ip>`, and a request that says
it was https still gets `Secure`. If you ever put RescueNet behind an https proxy
that does not send `x-forwarded-proto`, set `COOKIE_SECURE=true`.

### Getting location and the service worker on a phone

A phone needs a **secure origin**. Options, from simplest:

1. **Android Chrome flag.** Open `chrome://flags/#unsafely-treat-insecure-origin-as-secure`,
   enable it, type `http://<laptop-ip>:3000` in the box, relaunch Chrome. This is
   the same switch as the command-line flag I tested on desktop Chrome
   (`--unsafely-treat-insecure-origin-as-secure=http://192.168.1.6:3101`): with it the
   service worker registered, location worked, and pages opened with the server
   down. **Not tested on a phone**, and it only affects that one Chrome. iPhones
   and Safari have no equivalent.
2. **A trusted certificate on the phone.** Make a local certificate authority
   (for example with [mkcert](https://github.com/FiloSottile/mkcert)), issue a
   certificate for the laptop's IP, install the authority on the phone and mark it
   trusted, and serve the app over https. **Not tested.** Note that `next start`
   has no https option; this would need a small https front (for example a Node
   script using the certificate) and is not set up here.
3. **Click through a self-signed warning.** I would not rely on this: browsers
   generally refuse to register a service worker on a page whose certificate is
   not trusted, even after you accept the warning. **Not tested.**

### About `next dev --experimental-https`

I read what it does (its docs and `node_modules/next/dist/lib/mkcert.js`) and did
**not** run it, because it:

- downloads the `mkcert` program from GitHub the first time (needs internet once;
  on a laptop with no internet it falls back to plain http),
- runs `mkcert -install`, which adds a certificate authority to this computer's
  trust store (and may ask for your password),
- appends `certificates` to the project's `.gitignore` (this project's rules say
  never to edit `.gitignore`),
- only exists for `next dev`, not `next start`,
- creates a certificate that only **this laptop** trusts, so it does nothing for
  phones.

## The offline outbox

Reports and SOS go through `submitToOutbox()` (`lib/outbox.js`):

1. The item is saved in IndexedDB on the device (`lib/outboxStore.js`).
2. It is sent straight away. On success the person sees the same confirmation as
   before (a toast with a reference).
3. If the server cannot be reached (no connection, a timeout, a 5xx error, or a
   rate limit) the item stays **queued**. The person sees "Queued" on the report
   confirmation, or "SOS queued, will send when the connection returns" in the SOS
   modal.
4. Queued items are retried automatically: a timer every few seconds, a health
   check that notices the server coming back (`/api/health`), the browser's
   `online` event, and when the tab becomes visible again. **SOS is always sent
   before reports**, whatever order they were made in.
5. Each item has a status: `queued`, `sending`, `sent` or `failed`. `failed`
   means the server refused it for a reason a retry cannot fix (for example
   invalid data); it stays in the list with the reason.

Where it shows: an amber **"You're offline"** pill (blue when only the internet
is gone but the server is fine), a confirmation panel with a status badge on the
report page, the SOS modal, and a **"Saved on this device"** list on the account
page (also shown while offline, when the account itself cannot be loaded).

### Why nothing is sent twice

Three layers, strongest last:

1. An item is only sent from `queued`. Moving it to `sending` ("claiming") is one
   IndexedDB transaction, so two open tabs cannot both send it.
2. A report you submit is saved already "sending", so the background sender can
   never pick it up in between.
3. **The server.** Every item has a random id that is sent as an
   `Idempotency-Key` header (`lib/idempotency.js`). The incident stores it
   (`clientId`, unique index). A repeat gets the original answer (`200`, header
   `Idempotent-Replayed: true`) instead of a new incident. A replay is answered
   *before* the rate limit, so a retry after a lost response is never turned away.
   The header is optional: curl and older clients still work.

The unique index behind this is built on demand by `lib/ensureIndexes.js`, not
by awaiting `Model.init()`: Mongoose builds indexes by itself, but if that happens
while MongoDB is still connecting (the first requests after a server start) it
fails quietly, and `init()` then returns the same failed promise for the life of
the process, which made every keyed request return 500 until a restart. I hit
exactly this (3 of 8 restarts) and fixed it; 16 of 16 restarts now succeed and the
index exists afterwards.

Verified: the server saved an SOS but the answer was lost in transit, the phone
retried, and there was still exactly one SOS. Also verified: 8 parallel requests
with one key created one incident; two open tabs with six queued reports sent
each exactly once (6 created, 0 replays).

### When it happened: `capturedAt`

A report that waited in the queue reaches the server later, so the server's own
receive time (`createdAt`) would say "just now" about something that happened an
hour ago. So the phone sends the moment the person pressed Submit or SOS as
`capturedAt` (taken from when the item was saved, and sent again unchanged on
every retry), and the server keeps it in a **separate field**. `createdAt` is
never changed: it stays the server's receive time, and a client cannot set it.

The server only trusts `capturedAt` a little (`parseCapturedAt` in
`lib/incidentRules.js`). It is **ignored, with no error**, so the report is
still saved normally, unless it is:

- a real date: ISO 8601 with a time zone (`2026-10-24T09:15:30Z`, `...+05:30`) or a
  number of milliseconds since 1970. `2026-02-30`, a date with no time zone,
  free text, seconds-since-1970 and objects are all ignored;
- not in the future (the phone's clock is ahead); and
- not older than 7 days.

Screens show `capturedAt` when there is one and `createdAt` otherwise: the
incident page (with an extra "Reached the server ..." line when the two are more
than a minute apart), Recent activity, the Home Nearby list, the map popup and My
reports. The Home timeline is ordered by the time it shows; the API list
(`GET /api/incidents`) stays ordered by receive time.

Verified over `curl` (46 checks: both endpoints, every ignore rule, replays keep
the original, `createdAt` cannot be set) and end to end: a queued SOS pressed at
`06:34:35` and delivered at `06:34:51` is stored with both times.

Limit: the time comes from the phone's clock. A clock that is wrong by hours but
still inside the 7-day window is believed, and shows that wrong time; one that is
ahead is ignored.

### Limits of the outbox

- It retries **only while RescueNet is open** in a browser tab. There is no
  background sync: close the tab and the item waits, saved, until the app is
  opened again (then it sends within seconds).
- An item is stored in the browser that made it, so it cannot be seen from
  another device.
- If a browser cannot keep an outbox (some private modes), the app falls back to
  sending once, as before; the account page says so.

## The service worker

`public/sw.js`, hand-written, no packages. It is registered only in production
builds (`ServiceWorkerRegister`). **In development it is removed instead**, so a
worker left over from a production run on the same address (for example
`localhost:3000`) can never serve stale code to `npm run dev`.

- **Saved when it installs:** the 10 pages (`/`, `/map`, `/report`, `/shelters`,
  `/events`, `/resources`, `/about`, `/login`, `/register`, `/account`), the icons, the
  manifest, `/offline.html`, and **every script, style, font and the map worker
  those pages need**. The map loads its code on demand, so the worker reads each
  saved file for the names of further files and saves those too, until nothing new
  turns up (without this, `/map` first opened offline fails with a ChunkLoadError;
  I hit exactly that and fixed it).
- **Opening or reloading a page:** the network first, so you always get the newest
  page when the server is there. The saved copy is used when the server is down,
  or does not answer within 4 seconds. A page that was never saved shows
  `/offline.html`.
- **Scripts, styles, fonts, icons:** saved on first use and served from the saved
  copy (safe: the files in `/_next/static` have a content hash in their name).
- **Never touched:** anything under `/api/` (data is **never** cached, so the map
  and lists can never show old incidents as if they were live), any request with a
  `Range` header (the map's tiles file, see below), other origins, and anything
  that is not a GET.

### The map tiles and Range requests

The map reads `/maps/tricity.pmtiles` with HTTP `Range` requests. The worker lets
those through untouched. Verified with the worker in control: every tile request
was `206 Partial Content`, none was answered by the worker, and the map drew
normally. The consequence: **map tiles need the server**. If the server is down,
the map page opens (its code is saved) but the basemap is empty. The map's data
(incidents, shelters) comes from `/api/`, which is also never cached.

### After you rebuild

The worker only re-installs when `public/sw.js` itself changes. After a rebuild:
pages you open online get their saved copy refreshed on every visit, and new
files are saved as they are used. Pages you have not opened since the rebuild
still open offline from the previous consistent set. If you want a clean slate,
bump `VERSION` at the top of `sw.js` (old saved files are deleted when the new
worker activates), or in Chrome open DevTools, Application, Storage, and "Clear
site data".

## Manifest and icons

`app/manifest.js` serves `/manifest.webmanifest` (name, `display: standalone`,
theme colour, icons). The icons are drawn from the logo by
`scripts/generate-icons.mjs` (`npm run icons`, uses `sharp`, which Next.js already
installs): `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`,
`apple-touch-icon.png`, and `app/favicon.ico` (this replaces the stock Next.js
favicon). The generated files are committed, so nobody needs to run the script.
Verified: the manifest is valid and every icon loads as a PNG of its declared size.

## Test it by hand

1. `npm run build`, then `npm run start:lan`. Make sure MongoDB is running.
2. On the laptop open `http://localhost:3000`. Click around a few pages while the
   server is up (that is when they are saved).
3. Stop the server (Ctrl+C in its terminal). Within a few seconds an amber
   **"You're offline"** pill appears.
4. Make a report and press the SOS button, then Send. You should see **Queued**
   on the report and **SOS queued** in the modal. Open **Account**: both are
   listed under "Saved on this device".
5. Reload the page: it still opens, and the items are still there.
6. Start the server again. Within a few seconds (I measured 1.7 s from the
   server process starting) the pill disappears and one toast says the SOS and the
   saved report were sent. The SOS goes first.
7. In the account list both show **Sent**.

For the "WiFi off" version of the same test: turn WiFi off while the server keeps
running on the laptop. The pill turns **blue**, "No internet. RescueNet runs on
its own server, so everything here still works", and everything works. (The
laptop may not be able to find its own location with WiFi off, so an SOS needs a
saved account location.)

## Known limits

- Retries run only while the app is open (no background sync).
- No map tiles, data lists or account details while the server is unreachable.
- Over plain `http://<laptop-ip>` a phone has no service worker and no location.
- Rate limits are counted in memory per server process (they reset when the
  server restarts). Each device has its own limit (verified: after 10 SOS from
  `127.0.0.1`, an SOS from the laptop's LAN address was still accepted), but the
  address comes from the `x-forwarded-for` header, which a client can set itself,
  so the limit can be dodged (verified: an 11th SOS with `x-forwarded-for: 9.9.9.9`
  was accepted). A queued item that hits the limit waits the time the server asks
  for. Left for the security pass.
- Items made on one device cannot be viewed from another.
- Only reports and SOS are queued for later. Everything else that changes data
  (joining or leaving an event, creating or cancelling one, changing an incident's
  status, shelters) needs the server at that moment and shows an error if it
  cannot be reached. The Events page itself opens offline (it is saved like the
  others) but its list needs the server.
