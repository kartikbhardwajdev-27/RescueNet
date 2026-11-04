# Offline website (Step 32)

The hosted website (https on Vercel, or `npm start` on the laptop) keeps working with no internet after ONE online visit, like the Android app. The Android build is unchanged: it has its own copies of the files below (`app/mobile/overlay/`).

## What is saved, and where

| What | Where | Saved by |
| --- | --- | --- |
| Every route's HTML, its JS and CSS, fonts, icons, map sprites and glyphs | Cache API: `rescuenet-pages-vN`, `rescuenet-assets-vN` | the service worker (`app/public/sw.js`) when it installs |
| Last incidents, shelters, events and stats lists | IndexedDB `rescuenet-saved` | `app/lib/savedData.js`, every time a list loads |
| The map file `tricity.pmtiles` (about 4 MB) | Cache API `rescuenet-offline-data` | `app/lib/offline/mapStore.js`, once, with progress |
| The road graph `tricity-roads.rnrg` (about 1.4 MB) | IndexedDB `rescuenet-routing` | `app/lib/routing/graphStore.js` (already existed) |
| Reports and SOS made offline | IndexedDB `rescuenet-outbox` | the outbox (Step 11), sent once with an idempotency key |

Never saved: any `/api/auth/*` response, "my reports" / "my events", anything for one person only. The service worker never touches `/api/*`. The saved lists are deleted on logout and on login (they carry per-viewer flags such as "reported by you").

## The indicator

"Preparing offline use…" then "Offline ready ✓ (saved <time>)" (sidebar on desktop, a pill under the top bar on phones for 10 s). It is worked out from what is on the device (`app/lib/offline/manager.js`), not from a flag, and re-checked every minute and when the connection changes:

1. pages: the service worker checks its own cache against the list it saved at install;
2. data: all four lists are in IndexedDB;
3. map: the map file is in the cache and is a complete PMTiles file;
4. graph: the road graph is in IndexedDB.

If something cannot be saved (storage full, blocked) it says "Not ready for offline use: <why>" with a Retry button. "Map saved" is also shown on the map page.

## How the pieces behave

- **Service worker** `sw.js`, `VERSION = "v2"`. Install fetches all ten routes plus the incident page shell, reads the HTML and then the JS and CSS for more file names (the map code is lazy), and saves everything. If anything fails, the install fails and the old worker stays. Old `rescuenet-pages-*` and `rescuenet-assets-*` caches are deleted when a new one activates. Pages are network first (4 s timeout, a 5xx also falls back to the saved page); `/_next/static`, `/map-assets` and `/icons` are cache first. Change `VERSION` whenever `sw.js` changes behaviour.
- **Incident pages** `/incidents/<id>`: any incident that was opened online, and the 30 newest listed, are saved as pages. For any other id the saved shell is served and the page reads the id from the address, then shows the incident from the saved list.
- **Map**: `OfflineFirstSource` reads tiles from the saved copy when there is one, otherwise from the server with Range requests. The saved copy is read in whole (a service worker cannot answer Range requests from a cache).
- **Storage**: before downloading, `navigator.storage.estimate()` must show room for twice the file; `navigator.storage.persist()` is requested; a `QuotaExceededError` is reported, not thrown.

## Limits

- Offline, the app cannot tell who is logged in (it will not save auth responses), so the top-right account controls show "Log in / Sign up" until the server answers again. The login cookie is untouched: nothing is lost when the connection returns.
- Only the first 5 glyph ranges of the three Latin fonts and one Devanagari range are saved (enough for English and Hindi names): names in other scripts show no label offline.
- If the map file on the server changes, a device that already saved the old one keeps using it until site data is cleared (the map is rarely regenerated).
- Browsers can evict site data under storage pressure; the indicator then goes back to "Preparing…" and re-downloads on the next online visit. Persistent storage is requested but a browser may refuse.
- Needs https (or localhost): service workers do not exist on `http://<LAN-IP>`.
- iOS Safari clears site data of sites not used for about 7 days unless the site is added to the Home Screen.
- Local script: `node scripts/browser/check-offline-web.mjs` (after `npm run build`) is the end-to-end check described in Step 32.
