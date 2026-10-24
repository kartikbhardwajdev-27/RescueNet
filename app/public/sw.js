/* RescueNet service worker. Hand-written, no libraries.

   What it does
     - Keeps the app shell on the device: the pages, their JavaScript and CSS,
       the icons. Pages are fetched when the worker installs, so they open even
       if the server cannot be reached.
     - Navigations (opening or reloading a page): network first, so you always
       get the newest page when the server is there; the saved copy is used when
       it is not (or is too slow to answer).
     - Static files under /_next/static, /map-assets and /icons: saved on first
       use and served from the saved copy after that. Safe because the files in
       /_next/static have a content hash in their name.

   What it deliberately leaves alone (goes straight to the network)
     - /api/*: data is never cached here, so a map or list can never show
       out-of-date incidents as if they were live. Saving reports for later is
       the job of the outbox in the page (lib/outbox.js), not of this file.
     - Any request with a Range header, which is how the map reads its tiles
       from /maps/tricity.pmtiles. Answering a range request from a cache would
       need its own 206 handling; passing it through keeps the map exactly as it
       is without a service worker.
     - Everything on other origins, and every request that is not a GET.

   See docs/OFFLINE_APP.md. Bump VERSION when this file's behaviour changes. */

const VERSION = "v1";
const PAGES_CACHE = `rescuenet-pages-${VERSION}`;
const ASSETS_CACHE = `rescuenet-assets-${VERSION}`;
const CURRENT_CACHES = [PAGES_CACHE, ASSETS_CACHE];

// Pages saved when the worker installs (the ones with no login-only content).
const PRECACHE_PAGES = ["/", "/map", "/report", "/shelters", "/resources", "/about", "/login", "/register", "/account"];
const OFFLINE_PAGE = "/offline.html";
const PRECACHE_ASSETS = [
  OFFLINE_PAGE,
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/favicon.ico",
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
  return [...urls];
}

// Saves one file, and returns the further files it mentions (empty for images,
// fonts and anything that is not script or style).
async function saveAndScan(cache, url) {
  try {
    const response = await fetch(url, { cache: "reload" });
    if (!response.ok || response.type !== "basic") return [];
    const scannable = /\.(?:js|mjs|css)$/.test(new URL(url, self.location.origin).pathname);
    const text = scannable ? await response.clone().text() : null;
    await cache.put(url, response);
    return text ? findStaticUrls(text) : [];
  } catch {
    return []; // best effort: whatever is missing is saved the first time it is used
  }
}

// A page's HTML only names the files it needs straight away. Code that loads
// later (the map is loaded on demand) is named inside those files, and so on.
// So: save the files, read them for more names, and repeat until nothing new
// turns up. Without this, a page first opened offline cannot load its lazy code.
const MAX_STATIC_FILES = 400;
async function saveStaticTree(cache, seeds) {
  const seen = new Set(seeds);
  let level = [...seen];
  while (level.length > 0 && seen.size <= MAX_STATIC_FILES) {
    const found = await Promise.all(level.map((url) => saveAndScan(cache, url)));
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

// ---- install: save the app shell ----

async function precache() {
  const pages = await caches.open(PAGES_CACHE);
  const assets = await caches.open(ASSETS_CACHE);
  const staticUrls = new Set();

  await Promise.all(PRECACHE_ASSETS.map((url) => saveAndScan(assets, url)));
  await Promise.all(
    PRECACHE_PAGES.map(async (path) => {
      try {
        const response = await fetch(path, { cache: "reload" });
        if (!isSavablePage(response)) return;
        for (const url of findStaticUrls(await response.clone().text())) staticUrls.add(url);
        await pages.put(pageKey(path), response);
      } catch {
        // The page is saved the first time it is opened.
      }
    }),
  );
  await saveStaticTree(assets, [...staticUrls]);
}

self.addEventListener("install", (event) => {
  // The new worker takes over straight away; there is nothing to migrate.
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith("rescuenet-") && !CURRENT_CACHES.includes(name)) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

// ---- fetch ----

async function handleNavigation(event) {
  const { request } = event;
  const key = pageKey(new URL(request.url).pathname);
  const pages = await caches.open(PAGES_CACHE);

  const network = fetch(request).then(async (response) => {
    if (isSavablePage(response)) await pages.put(key, response.clone());
    return response;
  });
  // Whatever happens below, let the request finish so the saved copy gets refreshed.
  event.waitUntil(network.catch(() => {}));

  const saved = await pages.match(key);
  try {
    if (!saved) return await network;
    const tooSlow = new Promise((_, reject) => setTimeout(() => reject(new Error("slow")), NAVIGATION_TIMEOUT_MS));
    return await Promise.race([network, tooSlow]);
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
  // Everything else (page-data fetches, the map tiles file, ...): the network.
});
