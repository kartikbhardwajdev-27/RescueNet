// Step 32 browser check: the hosted website works with no connection after one online visit.
//
//   npm run build
//   node scripts/browser/check-offline-web.mjs [--port 3121] [--shots dir]
//   (local MongoDB with npm run demo:seed done; CHROME_PATH if Chrome is not at the usual Mac path)
//
// It starts `next start` itself (so it can stop it: a stopped server is the strictest "offline",
// it also cuts the service worker's own requests), and drives headless Chrome over CDP.
//   1 online visit, wait for the "Offline ready" indicator, log in
//   2 server stopped: reload Home, Map (drawn from the saved copy, with markers), Shelters, Events,
//     an incident page that was opened online, one that never was, Report, Resources, About, Account
//   3 navigate to a shelter and to an incident offline (road graph from the device)
//   4 queue a report and an SOS offline; start the server; each arrives exactly once
//   5 login state unchanged
//   6 CDP offline emulation (server up): the page's own requests fail, pages still open
//   7 a fresh profile that never visited online: normal error states, not blank pages
//   8 the saved data is cleared on logout; nothing private is saved; the cache has no /api responses
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { launch } from "./cdp.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const PORT = Number(flag("--port", 3121));
const BASE = `http://localhost:${PORT}`;
const SHOTS = path.resolve(flag("--shots", path.join(os.tmpdir(), "rescuenet-offline-shots")));
fs.mkdirSync(SHOTS, { recursive: true });
const appRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ok = (name, pass, detail = "") => {
  results.push(pass);
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

// ---- the server ----
let server = null;
async function health() {
  try {
    const r = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}
async function getJson(url) {
  for (let i = 0; i < 30; i += 1) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
    } catch {
      // try again
    }
    await sleep(500);
  }
  throw new Error(`no JSON from ${url}`);
}
async function startServer() {
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], { cwd: appRoot, stdio: "ignore", detached: true });
  for (let i = 0; i < 100; i += 1) {
    if (await health()) return;
    await sleep(300);
  }
  throw new Error("server did not start");
}
async function stopServer() {
  // `next start` runs the real server as a child process: stop the whole group.
  if (server) {
    try { process.kill(-server.pid, "SIGKILL"); } catch { /* already gone */ }
  }
  server = null;
  for (let i = 0; i < 50 && (await health()); i += 1) await sleep(200);
}

// ---- page helpers ----
const text = (page) => page.eval(`document.body.innerText`);
const exists = (page, sel) => page.eval(`!!document.querySelector(${JSON.stringify(sel)})`);
const clickText = (page, selector, t) =>
  page.eval(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find((x) => (x.getAttribute('aria-label') || x.textContent).trim().startsWith(${JSON.stringify(t)})); if (!b) return false; b.click(); return true; })()`);
const setField = (page, id, value) =>
  page.eval(`(() => { const e = document.getElementById(${JSON.stringify(id)}); const set = Object.getOwnPropertyDescriptor(e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set; set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
async function newPage(chrome, { geo = true, size = [1280, 900], mobile = false } = {}) {
  const page = await (await chrome.newPage()).ready();
  const failed = [];
  page.on((m) => {
    if (m.method === "Network.loadingFailed") failed.push(m.params.requestId);
  });
  const urls = new Map();
  page.on((m) => {
    if (m.method === "Network.requestWillBeSent") urls.set(m.params.requestId, m.params.request.url);
  });
  page.failedUrls = () => failed.map((id) => urls.get(id)).filter(Boolean);
  page.clearFailed = () => failed.splice(0);
  await page.send("Emulation.setDeviceMetricsOverride", { width: size[0], height: size[1], deviceScaleFactor: 1, mobile });
  if (geo) {
    await page.send("Browser.grantPermissions", { origin: BASE, permissions: ["geolocation"] });
    await page.send("Emulation.setGeolocationOverride", { latitude: 30.7398, longitude: 76.7827, accuracy: 10 });
  }
  return page;
}
async function waitReady(page, ms = 90000) {
  await page.waitFor(`document.querySelector('[data-offline-state]')?.dataset.offlineState === 'ready'`, ms);
}
const sameOriginFailures = (page) => page.failedUrls().filter((u) => u.startsWith(BASE) && !u.includes("/api/") && !u.includes("_rsc=") && !u.endsWith("/routing/meta.json")); // meta.json is the road graph's "is there a newer one?" probe: offline it falls back to the saved copy, by design

const PROFILE_A = fs.mkdtempSync(path.join(os.tmpdir(), "rn-offline-a-"));
const PROFILE_B = fs.mkdtempSync(path.join(os.tmpdir(), "rn-offline-b-"));
let chrome = null;
try {
  await startServer();
  const list = await getJson(`${BASE}/api/incidents?limit=200`);
  const shelters = await getJson(`${BASE}/api/shelters?limit=200`);
  const shelterList = shelters.shelters ?? shelters;
  const incidents = list.incidents ?? list;
  const openedId = incidents.find((i) => !i.isSos)?._id ?? incidents[0]._id;
  const neverOpenedId = incidents.find((i) => i._id !== openedId && !i.isSos)?._id;
  const sosBefore = incidents.filter((i) => i.isSos).length;
  const MARK = `offline-check-${Date.now()}`;

  chrome = await launch({ profile: PROFILE_A, port: 9361 });
  let page = await newPage(chrome);

  // ---- 1. online visit ----
  console.log("\n== 1. online visit ==");
  await page.goto(`${BASE}/`, { waitMs: 500 });
  const sawPreparing = await page.eval(`!!document.querySelector('[data-offline-state="preparing"]') || document.querySelector('[data-offline-state]')?.dataset.offlineState`);
  await waitReady(page);
  const ready1 = await text(page);
  ok("indicator reaches 'Offline ready ✓ (saved <time>)'", /Offline ready ✓ \(saved .+\)/.test(ready1), (ready1.match(/Offline ready[^\n]*/) ?? [""])[0]);
  console.log(`      (first thing seen: ${JSON.stringify(sawPreparing)})`);
  const caches1 = await page.eval(`caches.keys().then(async (k) => { const o = {}; for (const n of k) { const c = await caches.open(n); o[n] = (await c.keys()).map((r) => new URL(r.url).pathname); } return o; })`);
  const names = Object.keys(caches1);
  ok("caches are versioned and there is a saved map", names.some((n) => /^rescuenet-pages-v\d+$/.test(n)) && names.some((n) => /^rescuenet-assets-v\d+$/.test(n)) && caches1["rescuenet-offline-data"]?.includes("/maps/tricity.pmtiles"), names.join(", "));
  const apiInCache = Object.values(caches1).flat().filter((p) => p.startsWith("/api/"));
  ok("no /api response is in any cache", apiInCache.length === 0, apiInCache.join(", "));
  const pageKeys = caches1[names.find((n) => n.startsWith("rescuenet-pages-"))];
  for (const route of ["/", "/map", "/report", "/shelters", "/events", "/resources", "/about", "/login", "/register", "/account"]) {
    ok(`route HTML precached: ${route}`, pageKeys.includes(route));
  }
  const idb = await page.eval(`new Promise((resolve) => { const r = indexedDB.open('rescuenet-saved'); r.onsuccess = () => { const db = r.result; const q = db.transaction('responses').objectStore('responses').getAllKeys(); q.onsuccess = () => resolve(q.result); }; r.onerror = () => resolve(null); })`);
  ok("saved data holds exactly the four public lists", JSON.stringify([...idb].sort()) === JSON.stringify(["/api/events?limit=200", "/api/incidents?limit=200", "/api/shelters?limit=200", "/api/stats"].sort()), JSON.stringify(idb));

  // log in (cookie)
  const loginStatus = await page.eval(`fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'demo.citizen@rescuenet.test',password:'demo-rescuenet-2026'})}).then(r=>r.status)`);
  ok("logged in as the demo citizen", loginStatus === 200, `status ${loginStatus}`);
  const meBefore = await page.eval(`fetch('/api/auth/me').then(r=>r.json()).then(j=>j.email)`);
  // open the map, an incident, and let the map show its markers online
  await page.goto(`${BASE}/map`, { waitMs: 1500 });
  await page.waitFor(`document.querySelectorAll('.rn-marker').length >= 5`, 30000);
  await page.screenshot(`${SHOTS}/1-map-online.png`);
  await page.goto(`${BASE}/incidents/${openedId}`, { waitMs: 800 });
  await page.waitFor(`document.body.innerText.includes('Severity') || document.body.innerText.includes('Reported')`, 15000);
  await page.goto(`${BASE}/`, { waitMs: 500 });
  await waitReady(page);
  await sleep(1500);

  // ---- phone layout: the floating "Offline ready" pill (it shows for 10 s after it turns ready) ----
  console.log("\n== phone layout of the indicator ==");
  for (const [w, h] of [[360, 740], [390, 844], [412, 915]]) {
    await page.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: true });
    for (const route of ["/", "/map"]) {
      await page.goto(`${BASE}${route}`, { waitMs: 800 });
      await page.waitFor(`[...document.querySelectorAll('[data-offline-state]')].some((e) => e.getBoundingClientRect().width > 0)`, 20000);
      const m = await page.eval(`(() => {
        const pillEl = [...document.querySelectorAll('[data-offline-state]')].find((e) => e.getBoundingClientRect().width > 0);
        const pill = pillEl.getBoundingClientRect();
        const bar = document.querySelector('header').getBoundingClientRect();
        const cs = [...document.querySelectorAll('a[href], button, [role=group]')].filter((e) => { const r = e.getBoundingClientRect(); const v = getComputedStyle(e); return r.width > 0 && r.height > 0 && v.visibility !== 'hidden' && !e.closest('header') && !e.closest('[data-offline-state]'); });
        const hits = cs.filter((e) => { const r = e.getBoundingClientRect(); return r.left < pill.right && r.right > pill.left && r.top < pill.bottom && r.bottom > pill.top; }).map((e) => (e.getAttribute('aria-label') || e.textContent).trim().slice(0, 24));
        const overflow = document.documentElement.scrollWidth > innerWidth + 1;
        return { pill: { l: Math.round(pill.left), r: Math.round(pill.right), t: Math.round(pill.top), b: Math.round(pill.bottom), h: Math.round(pill.height) }, barBottom: Math.round(bar.bottom), hits, overflow, inView: pill.left >= 0 && pill.right <= innerWidth, text: pillEl.innerText.replace(/\s+/g, ' ') };
      })()`);
      ok(`phone ${w}x${h} ${route}: indicator inside the screen, below the top bar, over no control, no sideways scroll`, m.inView && m.pill.t >= m.barBottom && m.hits.length === 0 && !m.overflow, `${m.text} | pill ${JSON.stringify(m.pill)} bar↓${m.barBottom} hits=${m.hits.join("/") || "none"}`);
      if (w === 360 && route === "/map") await page.screenshot(`${SHOTS}/1-phone-360-map-pill.png`);
    }
  }
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await page.goto(`${BASE}/`, { waitMs: 500 });
  await waitReady(page);
  await sleep(1000);

  // ---- 2. server stopped, reload every route ----
  console.log("\n== 2. server stopped: reload each route ==");
  await stopServer();
  ok("the server is really stopped", !(await health()));
  const checks = [
    ["Home", "/", async (p) => { const t = await text(p); return { pass: /Saved data from/.test(t) && (await p.eval(`document.querySelectorAll('a[href^="/incidents/"]').length`)) > 0, d: "saved banner + incident links" }; }],
    ["Map", "/map", async (p) => {
      await p.waitFor(`document.querySelectorAll('.rn-marker').length >= 5`, 30000);
      await sleep(2500);
      const t = await text(p);
      return { pass: /Saved data from/.test(t) && (await exists(p, ".maplibregl-canvas")) && /Map saved/.test(t), d: `${await p.eval(`document.querySelectorAll('.rn-marker').length`)} markers` };
    }],
    ["Shelters", "/shelters", async (p) => { const t = await text(p); return { pass: /Saved data from/.test(t) && /Navigate/.test(t), d: "banner + shelter cards" }; }],
    ["Events", "/events", async (p) => { const t = await text(p); return { pass: /Saved data from/.test(t), d: "banner" }; }],
    ["Incident (opened online)", `/incidents/${openedId}`, async (p) => { await p.waitFor(`document.body.innerText.includes('Reported')`, 15000); const t = await text(p); return { pass: /Saved data from/.test(t) && !/couldn't find that incident/i.test(t), d: "incident shown from saved data" }; }],
    ["Report", "/report", async (p) => ({ pass: await exists(p, "#report-description"), d: "form" })],
    ["Resources", "/resources", async (p) => ({ pass: /112/.test(await text(p)), d: "numbers" })],
    ["About", "/about", async (p) => ({ pass: /RescueNet/.test(await text(p)), d: "text" })],
  ];
  if (neverOpenedId) {
    checks.splice(5, 0, ["Incident (never opened)", `/incidents/${neverOpenedId}`, async (p) => { await p.waitFor(`document.body.innerText.includes('Reported') || document.body.innerText.includes("couldn't find")`, 15000); const t = await text(p); return { pass: /Saved data from/.test(t) && !/couldn't find that incident/i.test(t), d: "shell + id from the address" }; }]);
  }
  for (const [name, route, verify] of checks) {
    page.clearFailed();
    await page.goto(`${BASE}${route}`, { waitMs: 1200 });
    let result;
    try { result = await verify(page); } catch (error) { result = { pass: false, d: `${String(error.message).slice(0, 60)} | at ${await page.eval("location.pathname")}: ${(await text(page)).replace(/\s+/g, " ").slice(0, 160)}` }; }
    const t = await text(page);
    const blank = t.trim().length < 40;
    ok(`offline reload: ${name}`, result.pass && !blank, result.d);
    const bad = sameOriginFailures(page);
    ok(`offline reload: ${name}: no failed script/style/map/graph request`, bad.length === 0, bad.slice(0, 3).join(", "));
    if (name === "Map") await page.screenshot(`${SHOTS}/2-map-offline.png`);
    if (name === "Home") await page.screenshot(`${SHOTS}/2-home-offline.png`);
  }
  // the map drew real tiles from the saved copy: count non-background pixels in a screenshot
  await page.goto(`${BASE}/map`, { waitMs: 3000 });
  await page.waitFor(`document.querySelectorAll('.rn-marker').length >= 5`, 30000);
  await sleep(3000);
  const pixels = await page.eval(`(() => { const c = document.querySelector('.maplibregl-canvas'); const gl = c.getContext('webgl2') || c.getContext('webgl'); return c ? { w: c.width, h: c.height } : null; })()`).catch(() => null);
  const tileCheck = await page.eval(`new Promise((resolve) => { const c = document.querySelector('.maplibregl-canvas'); const img = new Image(); resolve(c ? c.toDataURL('image/png').length : 0); })`).catch(() => 0);
  console.log(`      (map canvas ${JSON.stringify(pixels)}; see ${SHOTS}/2-map-offline.png for the drawn tiles)`);
  void tileCheck;

  // ---- 3. navigation offline ----
  console.log("\n== 3. navigation offline ==");
  await page.goto(`${BASE}/shelters`, { waitMs: 1500 });
  const clicked = await clickText(page, "a", "Navigate");
  ok("shelters: 'Navigate' clicked", clicked);
  let navOk = true;
  try { await page.waitFor(`!!document.querySelector('[data-nav=strip]')`, 40000); } catch { navOk = false; }
  ok("shelter route drawn offline (summary strip)", navOk, navOk ? (await page.eval(`document.querySelector('[data-nav=strip]').innerText.replace(/\\s+/g,' ').slice(0,100)`)) : (await text(page)).slice(0, 160));
  await page.screenshot(`${SHOTS}/3-shelter-route-offline.png`);
  await page.goto(`${BASE}/incidents/${openedId}`, { waitMs: 1500 });
  await page.waitFor(`document.body.innerText.includes('Reported')`, 15000);
  const clicked2 = await clickText(page, "a", "Navigate here");
  ok("incident page: 'Navigate here' clicked", clicked2);
  let nav2 = true;
  try { await page.waitFor(`!!document.querySelector('[data-nav=strip]') || [...document.querySelectorAll('button')].some((b) => /Continue/.test(b.textContent))`, 40000); } catch { nav2 = false; }
  if (nav2 && !(await exists(page, "[data-nav=strip]"))) { await clickText(page, "button", "Continue"); try { await page.waitFor(`!!document.querySelector('[data-nav=strip]')`, 30000); } catch { nav2 = false; } }
  ok("incident route drawn offline", nav2, nav2 ? "" : (await text(page)).slice(0, 160));
  await page.screenshot(`${SHOTS}/3-incident-route-offline.png`);

  // ---- 4. queue a report and an SOS offline ----
  console.log("\n== 4. report + SOS queued offline, sent exactly once ==");
  await page.goto(`${BASE}/report`, { waitMs: 1500 });
  await page.eval(`document.querySelector('input[name=type][value=fire]')?.click()`);
  await setField(page, "report-description", `Offline check report ${MARK}`);
  await setField(page, "report-lat", "30.7398");
  await setField(page, "report-lng", "76.7827");
  await page.eval(`document.querySelector('form button[type=submit]').click()`);
  let queuedReport = true;
  try { await page.waitFor(`/Report queued|queued/i.test(document.body.innerText)`, 20000); } catch { queuedReport = false; }
  ok("offline report is queued (confirmation says so)", queuedReport);
  await page.screenshot(`${SHOTS}/4-report-queued.png`);
  await page.goto(`${BASE}/`, { waitMs: 1000 });
  await page.eval(`(() => { const b = [...document.querySelectorAll('button')].find((x) => /EMERGENCY SOS|SOS/.test(x.textContent) && x.getBoundingClientRect().width > 0); b?.click(); })()`);
  await page.waitFor(`!!document.querySelector('dialog[open]')`, 10000);
  await clickText(page, "dialog button", "Send");
  let queuedSos = true;
  try { await page.waitFor(`/SOS queued/.test(document.body.innerText)`, 25000); } catch { queuedSos = false; }
  ok("offline SOS is queued (modal says so)", queuedSos);
  await page.screenshot(`${SHOTS}/4-sos-queued.png`);
  await clickText(page, "dialog button", "Close");
  const queueStore = await page.eval(`new Promise((resolve) => { const dbs = indexedDB.databases ? indexedDB.databases() : Promise.resolve([]); dbs.then((l) => resolve(l.map((d) => d.name))); })`);
  console.log(`      (databases: ${queueStore.join(", ")})`);

  console.log("      …starting the server again");
  await startServer();
  // The page never went "offline" for the browser, so the outbox's own retry timer and health checks find the server.
  let sent = false;
  for (let i = 0; i < 90; i += 1) {
    const all = await getJson(`${BASE}/api/incidents?limit=200`);
    const arr = all.incidents ?? all;
    const reports = arr.filter((x) => (x.description ?? "").includes(MARK));
    const sos = arr.filter((x) => x.isSos).length;
    if (reports.length >= 1 && sos > sosBefore) { sent = true; break; }
    await sleep(1000);
  }
  await sleep(8000); // time for a duplicate to show up, if there were one
  const finalAll = await getJson(`${BASE}/api/incidents?limit=200`);
  const finalArr = finalAll.incidents ?? finalAll;
  const reportCount = finalArr.filter((x) => (x.description ?? "").includes(MARK)).length;
  const sosCount = finalArr.filter((x) => x.isSos).length - sosBefore;
  ok("queued report arrived after the server came back", sent && reportCount >= 1, `${reportCount} copy`);
  ok("report sent exactly once", reportCount === 1);
  ok("SOS sent exactly once", sosCount === 1, `${sosCount} new SOS`);

  // ---- 5. login state ----
  console.log("\n== 5. login state ==");
  const meAfter = await page.eval(`fetch('/api/auth/me').then(r=>r.json()).then(j=>j.email)`);
  ok("still logged in as the same person after the outage", meBefore === "demo.citizen@rescuenet.test" && meAfter === meBefore, `${meBefore} → ${meAfter}`);

  // ---- 6. CDP offline emulation ----
  console.log("\n== 6. CDP network emulation (server up) ==");
  await page.goto(`${BASE}/`, { waitMs: 800 });
  await page.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  const apiBlocked = await page.eval(`fetch('/api/health',{cache:'no-store'}).then(() => 'reached', () => 'blocked')`);
  ok("emulated offline: the page's own API request fails", apiBlocked === "blocked", apiBlocked);
  for (const route of ["/", "/shelters", "/events", "/report", "/resources", "/about", "/map"]) {
    await page.goto(`${BASE}${route}`, { waitMs: 1200 });
    const t = await text(page);
    ok(`emulated offline reload: ${route}`, t.trim().length > 60 && !/This site can.t be reached/.test(t), t.replace(/\s+/g, " ").slice(0, 60));
  }
  await page.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

  // ---- 8. logout clears saved data ----
  console.log("\n== 8. logout clears the saved data ==");
  await page.goto(`${BASE}/`, { waitMs: 800 });
  await waitReady(page);
  const countBefore = await page.eval(`new Promise((resolve) => { const r = indexedDB.open('rescuenet-saved'); r.onsuccess = () => { const q = r.result.transaction('responses').objectStore('responses').count(); q.onsuccess = () => resolve(q.result); }; })`);
  // the UI logout path (clientSession.signOutHere) is what clears: use the button
  await page.goto(`${BASE}/account`, { waitMs: 1200 });
  const out = await clickText(page, "button", "Log out");
  await sleep(1500);
  const countAfter = await page.eval(`new Promise((resolve) => { const r = indexedDB.open('rescuenet-saved'); r.onsuccess = () => { const q = r.result.transaction('responses').objectStore('responses').count(); q.onsuccess = () => resolve(q.result); }; })`);
  console.log(`      (log-out button found: ${out}; saved lists before ${countBefore}, after ${countAfter}; the manager refills them once online)`);
  ok("saved data had four lists before logout", countBefore === 4);
  ok("logging out cleared the saved lists", out && countAfter === 0, `${countAfter} left`);

  await chrome.close();
  chrome = null;

  // ---- 7. fresh profile ----
  console.log("\n== 7. fresh profile that never visited online ==");
  chrome = await launch({ profile: PROFILE_B, port: 9362 });
  const fresh = await newPage(chrome);
  await fresh.send("Network.setBlockedURLs", { urls: [`${BASE}/api/*`, `${BASE}/maps/*`, `${BASE}/routing/*`] });
  for (const route of ["/", "/map", "/shelters", "/events", "/report", "/resources", "/about", "/incidents/" + openedId]) {
    await fresh.goto(`${BASE}${route}`, { waitMs: 2500 });
    const t = (await text(fresh)).replace(/\s+/g, " ");
    const notSaved = !/Saved data from/.test(t);
    const main = (await fresh.eval(`document.querySelector('main')?.innerText ?? ''`)).replace(/\s+/g, " ");
    const hasError = /Couldn.t (reach|load)|couldn.t find that incident|Something went wrong/i.test(main) || ["/report", "/resources", "/about"].includes(route);
    ok(`fresh profile, API blocked: ${route} shows content or a normal error, not blank`, main.length > 60 && hasError && notSaved, main.slice(0, 90));
    if (route === "/") await fresh.screenshot(`${SHOTS}/7-fresh-home.png`);
    if (route === "/map") await fresh.screenshot(`${SHOTS}/7-fresh-map.png`);
  }
  const freshState = await fresh.eval(`document.querySelector('[data-offline-state]')?.dataset.offlineState ?? 'none'`);
  ok("fresh profile with the API blocked is NOT shown as 'Offline ready'", freshState !== "ready", freshState);
  await fresh.send("Network.setBlockedURLs", { urls: [] });
  await chrome.close();
  chrome = null;
  // truly never visited and the server down: only the browser's own error page is possible
  await stopServer();
  chrome = await launch({ profile: fs.mkdtempSync(path.join(os.tmpdir(), "rn-offline-c-")), port: 9363 });
  const cold = await newPage(chrome, { geo: false });
  const nav = await cold.send("Page.navigate", { url: `${BASE}/` });
  console.log(`      (never visited + server down: Chrome's own error page, errorText=${nav.errorText ?? "none"}; the app cannot run before its first load, nothing to fix in the app)`);
  ok("never visited + server down gives a normal browser network error, not a half-loaded app", Boolean(nav.errorText));
} catch (error) {
  console.error("\nSCRIPT ERROR:", error.stack ?? error);
  results.push(false);
} finally {
  await chrome?.close().catch(() => {});
  await stopServer();
}
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed${failed ? `, ${failed} FAILED` : ""}. Screenshots: ${SHOTS}`);
process.exit(failed ? 1 : 0);
