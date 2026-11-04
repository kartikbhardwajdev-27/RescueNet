/* RescueNet service worker. Hand-written, no libraries.

   What it does
     - Keeps the app shell on the device: every route's HTML, the JavaScript and
       CSS it needs (found by reading the HTML and then the files themselves, so
       code that loads later, like the map, is included), fonts, icons, the map's
       sprites and the most used glyph ranges. All of it is saved when the worker
       installs. If ANY of it cannot be saved the install fails and the old worker
       (if any) stays in charge, so a half-saved shell is never trusted.
     - Navigations (opening or reloading a page): network first, so you always
       get the newest page when the server is there; the saved copy is used when
       it is not, is too slow, or is failing (5xx). An incident page that was
       never opened gets the saved incident page shell, which reads the id from
       the address.
     - Static files under /_next/static, /map-assets and /icons: cache first.
       Safe because the files in /_next/static have a content hash in their name.
     - Answers a { type: "status" } message with what is saved (lib/offline/manager.js
       uses it for the "Offline ready" indicator) and a { type: "cache-pages" }
       message by saving more pages (incident pages).

   What it deliberately leaves alone (goes straight to the network)
     - /api/*: data is never cached here, so a map or list can never show
       out-of-date incidents as if they were live. The app keeps its own saved copy
       of a few public lists (lib/savedData.js) and says so when it shows one.
       Saving reports for later is the outbox's job (lib/outbox.js).
     - The map file (/maps/tricity.pmtiles) and the road graph (/routing/*): the page
       saves those itself (lib/offline/mapStore.js, lib/routing/graphStore.js).
     - Any request with a Range header, and everything on other origins, and every
       request that is not a GET.

   Caches are versioned: bump VERSION when this file's behaviour changes. On
   activation every other "rescuenet-pages-*" / "rescuenet-assets-*" cache is deleted.
   See docs/OFFLINE_WEB.md. */

const VERSION = "v2";
const PAGES_CACHE = `rescuenet-pages-${VERSION}`;
const ASSETS_CACHE = `rescuenet-assets-${VERSION}`;
const CURRENT_CACHES = [PAGES_CACHE, ASSETS_CACHE];
const MANIFEST_KEY = "/__rescuenet-precache.json";

// Every route with a page of its own.
const PRECACHE_PAGES = ["/", "/map", "/report", "/shelters", "/events", "/resources", "/about", "/login", "/register", "/account"];
// The incident page is /incidents/<id>. This id matches no incident; its page is
// the shell served for incident ids that were never opened.
const INCIDENT_SHELL_ID = "000000000000000000000000";
const INCIDENT_SHELL = `/incidents/${INCIDENT_SHELL_ID}`;
const INCIDENT_PATH = /^\/incidents\/[^/]+$/;
const OFFLINE_PAGE = "/offline.html";

// The map's sprites and the glyph ranges it uses for Latin, Devanagari and
// punctuation labels (a range that is not saved only means those labels are
// missing offline; see docs/OFFLINE_WEB.md).
const GLYPH_FONTS = ["Noto Sans Regular", "Noto Sans Medium", "Noto Sans Italic"];
const GLYPH_RANGES = ["0-255", "256-511", "512-767", "8192-8447", "8448-8703"];
const MAP_ASSETS = [
  "/map-assets/sprites/v4/dark.json",
  "/map-assets/sprites/v4/dark.png",
  "/map-assets/sprites/v4/dark@2x.json",
  "/map-assets/sprites/v4/dark@2x.png",
  ...GLYPH_FONTS.flatMap((font) => GLYPH_RANGES.map((range) => `/map-assets/fonts/${encodeURIComponent(font)}/${range}.pbf`)),
  `/map-assets/fonts/${encodeURIComponent("Noto Sans Devanagari Regular v1")}/2304-2559.pbf`,
];

const PRECACHE_ASSETS = [
  OFFLINE_PAGE,
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/favicon.ico",
  ...MAP_ASSETS,
];

// With a saved copy available, do not leave someone waiting on a connection
// that is hanging (a phone at the edge of WiFi range) for longer than this.
const NAVIGATION_TIMEOUT_MS = 4000;

const STATIC_PREFIXES = ["/_next/static/", "/map-assets/", "/icons/"];
const STATIC_FILES = ["/manifest.webmanifest", "/favicon.ico", OFFLINE_PAGE];

// ---- helpers ----

const pageKey = (path) => (path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path);

// A page worth saving: a normal 200 HTML answer, not a redirect or an error.
function isSavablePage(response) {
  return (
    response.ok &&
    response.type === "basic" &&
    !response.redirected &&
    (response.headers.get("content-type") || "").includes("text/html")
  );
}

// The script, style and font files mentioned in some text: a page's HTML, or a
// JavaScript or CSS file. They appear as full paths ("/_next/static/...") and as
// "static/chunks/<file>" inside the bundler's own data.
function findStaticUrls(text) {
  const urls = new Set();
  for (const match of text.matchAll(/\/_next\/static\/[^"'\\\s)<>]+/g)) urls.add(match[0]);
  for (const match of text.matchAll(/(?<![\w/])static\/(?:chunks|media)\/[^"'\\\s)<>]+/g)) urls.add(`/_next/${match[0]}`);
  return [...urls].map((url) => url.replace(/[,;]+$/, ""));
}

// Saves one file and returns the further files it mentions (empty for images,
// fonts and anything that is not script or style). Throws when it cannot be saved.
async function saveAndScan(cache, url, saved) {
  const response = await fetch(url, { cache: "reload" });
  if (!response.ok || response.type !== "basic") throw new Error(`${url}: ${response.status}`);
  const scannable = /\.(?:js|mjs|css)$/.test(new URL(url, self.location.origin).pathname);
  const text = scannable ? await response.clone().text() : null;
  await cache.put(url, response);
  saved.add(url);
  return text ? findStaticUrls(text) : [];
}

// A page's HTML only names the files it needs straight away. Code that loads
// later (the map is loaded on demand) is named inside those files, and so on.
// So: save the files, read them for more names, and repeat until nothing new
// turns up. Without this, a page first opened offline cannot load its lazy code.
const MAX_STATIC_FILES = 600;
async function saveStaticTree(cache, seeds, saved) {
  const seen = new Set(seeds);
  let level = [...seen];
  while (level.length > 0) {
    if (seen.size > MAX_STATIC_FILES) throw new Error("too many static files");
    const found = await Promise.all(level.map((url) => saveAndScan(cache, url, saved)));
    level = [];
    for (const urls of found) {
      for (const url of urls) {
        if (!seen.has(url)) {
          seen.add(url);
          level.push(url);
        }
      }
    }
  }
}

async function savePage(pages, path, staticUrls, savedPages) {
  const response = await fetch(path, { cache: "reload" });
  if (!isSavablePage(response)) throw new Error(`${path}: not a savable page (${response.status})`);
  for (const url of findStaticUrls(await response.clone().text())) staticUrls.add(url);
  await pages.put(pageKey(path), response);
  savedPages.add(pageKey(path));
}

// ---- install: save the app shell, all of it or nothing ----

async function precache() {
  const pages = await caches.open(PAGES_CACHE);
  const assets = await caches.open(ASSETS_CACHE);
  const staticUrls = new Set();
  const savedPages = new Set();
  const savedAssets = new Set();

  await Promise.all(PRECACHE_ASSETS.map((url) => saveAndScan(assets, url, savedAssets)));
  await Promise.all([...PRECACHE_PAGES, INCIDENT_SHELL].map((path) => savePage(pages, path, staticUrls, savedPages)));
  await saveStaticTree(assets, [...staticUrls], savedAssets);

  // Written last: its presence means everything above was saved.
  await assets.put(
    MANIFEST_KEY,
    new Response(JSON.stringify({ version: VERSION, savedAt: Date.now(), pages: [...savedPages], assets: [...savedAssets] }), {
      headers: { "content-type": "application/json" },
    }),
  );
}

self.addEventListener("install", (event) => {
  // The new worker takes over straight away; there is nothing to migrate. If
  // precache() throws, the install fails and the browser tries again later.
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        const ours = name.startsWith("rescuenet-pages-") || name.startsWith("rescuenet-assets-");
        if (ours && !CURRENT_CACHES.includes(name)) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

// ---- messages from the page ----

// "status": is everything this version saves really in the cache? Answers
// { ok, version, savedAt, missing: [urls] }. Checks the cache itself, not just the
// manifest, so a cache the browser evicted in part is noticed.
async function status() {
  const assets = await caches.open(ASSETS_CACHE);
  const pages = await caches.open(PAGES_CACHE);
  const manifestResponse = await assets.match(MANIFEST_KEY);
  if (!manifestResponse) return { ok: false, version: VERSION, savedAt: null, missing: [MANIFEST_KEY] };
  const manifest = await manifestResponse.json();
  const missing = [];
  for (const path of manifest.pages) if (!(await pages.match(path))) missing.push(path);
  for (const url of manifest.assets) if (!(await assets.match(url))) missing.push(url);
  return { ok: missing.length === 0, version: VERSION, savedAt: manifest.savedAt, missing };
}

// "cache-pages": save more pages (incident pages the app knows about). Best effort.
async function cachePages(paths) {
  const pages = await caches.open(PAGES_CACHE);
  let saved = 0;
  for (const path of paths) {
    if (!INCIDENT_PATH.test(path) || (await pages.match(pageKey(path)))) continue;
    try {
      const response = await fetch(path);
      if (isSavablePage(response)) {
        await pages.put(pageKey(path), response);
        saved += 1;
      }
    } catch {
      // Saved when it is first opened instead.
    }
  }
  return saved;
}

self.addEventListener("message", (event) => {
  const data = event.data;
  const port = event.ports?.[0];
  if (!data || !port) return;
  if (data.type === "status") {
    event.waitUntil(
      status()
        .then((result) => port.postMessage(result))
        .catch(() => port.postMessage({ ok: false, version: VERSION, savedAt: null, missing: ["error"] })),
    );
  } else if (data.type === "cache-pages" && Array.isArray(data.paths)) {
    event.waitUntil(
      cachePages(data.paths.slice(0, 60))
        .then((saved) => port.postMessage({ saved }))
        .catch(() => port.postMessage({ saved: 0 })),
    );
  }
});

// ---- fetch ----

async function handleNavigation(event) {
  const { request } = event;
  const path = pageKey(new URL(request.url).pathname);
  const pages = await caches.open(PAGES_CACHE);

  const network = fetch(request).then(async (response) => {
    if (isSavablePage(response)) await pages.put(path, response.clone());
    return response;
  });
  // Whatever happens below, let the request finish so the saved copy gets refreshed.
  event.waitUntil(network.catch(() => {}));

  // The saved copy of this page; for an incident that was never opened, the shell.
  const saved = (await pages.match(path)) ?? (INCIDENT_PATH.test(path) ? await pages.match(INCIDENT_SHELL) : undefined);
  try {
    if (!saved) return await network;
    const tooSlow = new Promise((_, reject) => setTimeout(() => reject(new Error("slow")), NAVIGATION_TIMEOUT_MS));
    const response = await Promise.race([network, tooSlow]);
    // A failing server is no better than none: show the saved page instead.
    return response.status >= 500 ? saved : response;
  } catch {
    return saved ?? (await caches.match(OFFLINE_PAGE)) ?? Response.error();
  }
}

async function cacheFirst(request) {
  const assets = await caches.open(ASSETS_CACHE);
  const saved = await assets.match(request);
  if (saved) return saved;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") assets.put(request, response.clone()).catch(() => {});
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (request.cache === "only-if-cached" && request.mode !== "same-origin") return;
  if (request.headers.has("range")) return; // map tiles: see the note at the top

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // data is never cached here
  if (url.pathname === "/sw.js") return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(event));
    return;
  }
  if (STATIC_PREFIXES.some((prefix) => url.pathname.startsWith(prefix)) || STATIC_FILES.includes(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
  // Everything else (page-data fetches, the map file, the road graph, ...): the network.
});
