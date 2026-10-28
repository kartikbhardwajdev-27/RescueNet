// "Navigate here" on an incident, checked in headless Chrome at three phone sizes (Step 28).
//
//   npm run build && npx next start -p 3110       (the production server, with npm run demo:seed)
//   npm run check:incident-phone -- http://localhost:3110 --shots /tmp/incident-shots
//
// Uses the demo incidents. One extra incident, far outside the mapped roads, is added to the
// list the page receives (the page's fetch is wrapped; nothing is written to the database).
// The position is faked (DevTools), not real GPS.
//
// Cases: a low active incident, a critical active incident (the confirmation: Cancel, then
// Continue), a resolved incident (no warning), an incident inside its own danger zone (no
// penalty, no warning about itself), an incident outside coverage (straight line instead),
// "Navigate here" in the map popup, and the layout (no overlap, no clipped text, panels at
// most 30% of the screen, the map keeps at least half of its height).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { launch } from "./cdp.mjs";

const args = process.argv.slice(2);
const shotsFlag = args.indexOf("--shots");
const base = args.find((a, i) => !a.startsWith("--") && i !== shotsFlag + 1) ?? "http://localhost:3110";
const origin = new URL(base).origin;
const SHOTS = shotsFlag >= 0 ? path.resolve(args[shotsFlag + 1]) : path.join(os.tmpdir(), "rescuenet-incident-shots");
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "rescuenet-chrome-"));
fs.mkdirSync(SHOTS, { recursive: true });
const SECTOR17 = { lat: 30.7398, lon: 76.7827 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
let currentSize = "";
const ok = (name, pass, detail = "") => {
  results.push(pass);
  console.log(`${pass ? "PASS" : "FAIL"}  [${currentSize}] ${name}${detail ? `  (${detail})` : ""}`);
};

const incidents = await (await fetch(`${base}/api/incidents`)).json();
const pick = (test) => incidents.find(test);
const LOW = pick((i) => i.seeded && i.severity === "low" && i.status === "reported");
const CRITICAL = pick((i) => i.seeded && i.severity === "critical" && i.status === "reported");
const RESOLVED = pick((i) => i.seeded && i.severity === "critical" && i.status === "resolved");
const OWN_ZONE = pick((i) => i.seeded && i.type === "flood" && i.severity === "high" && i.status !== "resolved");
if (!LOW || !CRITICAL || !RESOLVED || !OWN_ZONE) throw new Error("The demo incidents are missing: run npm run demo:seed");
const FAR = { _id: "fake-far", type: "medical", severity: "medium", status: "reported", description: "Far from any road (injected by the check)", address: "Nowhere", location: { type: "Point", coordinates: [77.9, 31.6] }, createdAt: new Date().toISOString() };

const INJECT = `(() => {
  const real = window.fetch;
  window.fetch = async (input, init) => {
    const response = await real(input, init);
    const url = typeof input === 'string' ? input : input.url;
    if (/\\/api\\/incidents(\\?|$)/.test(url) && !/mine=/.test(url)) {
      const body = await response.clone().json();
      if (Array.isArray(body)) return new Response(JSON.stringify([...body, ${JSON.stringify(FAR)}]), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return response;
  };
})()`;

const MEASURE = `(() => {
  const vw = innerWidth, vh = innerHeight;
  const visible = (el) => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !el.closest('[aria-hidden="true"]'); };
  const label = (el) => (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().replace(/\\s+/g, ' ').slice(0, 40);
  const els = [...document.querySelectorAll('button, a[href], [role=radio]')]
    .filter((el) => !document.querySelector('[role=alertdialog]') || !!el.closest('[role=alertdialog]'))
    .filter((el) => !el.closest('.rn-marker, .maplibregl-canvas-container, .maplibregl-ctrl-attrib, .maplibregl-popup, .maplibregl-ctrl-top-right, .maplibregl-ctrl-top-left, .maplibregl-ctrl-bottom-left, #nav-sheet'))
    .filter(visible).map((el) => ({ el, label: label(el), r: el.getBoundingClientRect() }));
  const overlaps = [];
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
    const a = els[i], b = els[j];
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (w > 1 && h > 1) overlaps.push(a.label + ' x ' + b.label);
  }
  const clippedText = [];
  for (const root of document.querySelectorAll('[data-nav], [aria-label="Road directions"], [role=alertdialog], [data-banner]')) for (const el of [root, ...root.querySelectorAll('*')]) {
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || !visible(el)) continue;
    if (el.hasAttribute('data-truncates') || el.hasAttribute('data-clamp') || el.closest('#nav-sheet')) continue;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 || r.left < -1 || el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible') clippedText.push(label(el));
  }
  const rect = (sel) => { const e = document.querySelector(sel); if (!e || !visible(e)) return null; const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height }; };
  return { vh, overlaps, clippedText, card: rect('.rn-map'), instruction: rect('[data-nav=instruction]'), strip: rect('[data-nav=strip]'), sheet: rect('#nav-sheet'),
    stripName: document.querySelector('[data-nav=strip] [data-truncates]')?.textContent.trim() ?? null,
    bannerText: document.querySelector('[data-banner], [data-nav=instruction] ~ div button')?.textContent.trim() ?? null,
    instructionText: document.querySelector('[data-nav=instruction] p')?.textContent.trim() ?? null,
    dialog: !!document.querySelector('[role=alertdialog]'), dialogText: document.querySelector('[role=alertdialog]')?.innerText ?? null,
    fallbackText: document.querySelector('[aria-label="Road directions"]')?.innerText ?? null };
})()`;

const SETTINGS = [[360, 740, 3], [390, 844, 3], [412, 915, 2.625]];
const chrome = await launch({ profile: PROFILE, port: 9341 });
try {
  for (const [w, h, dpr] of SETTINGS) {
    currentSize = `${w}x${h}`;
    const page = await (await chrome.newPage()).ready();
    const click = (t) => page.eval(`(() => { const b = [...document.querySelectorAll('button, a')].find((x) => (x.getAttribute('aria-label') || x.textContent).trim().startsWith(${JSON.stringify(t)})); if (!b) return false; b.click(); return true; })()`);
    const measure = () => page.eval(MEASURE);
    const shot = (name) => page.screenshot(`${SHOTS}/${w}x${h}-${name}.png`);
    const open = async (url, waitForRoute = true) => {
      await page.goto(`${base}${url}`, { waitMs: 1200 });
      if (waitForRoute) await page.waitFor(`!!document.querySelector('[data-nav=strip]')`, 30000);
      await sleep(900);
    };
    const sheetText = async () => {
      await click("Show directions");
      await sleep(500);
      const t = await page.eval(`document.querySelector('#nav-sheet')?.innerText ?? ''`);
      await click("Hide directions");
      await sleep(250);
      return t;
    };
    try {
      await page.send("Browser.grantPermissions", { origin, permissions: ["geolocation"] });
      await page.send("Emulation.setGeolocationOverride", { latitude: SECTOR17.lat, longitude: SECTOR17.lon, accuracy: 10 });
      await page.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: dpr, mobile: true });
      await page.send("Page.addScriptToEvaluateOnNewDocument", { source: INJECT });

      // 1. a low active incident, from its link
      await open(`/map?navigate=incident:${LOW._id}`);
      let m = await measure();
      ok("low active: no confirmation, the route starts", !m.dialog && !!m.strip);
      ok("low active: the route stops at 'Nearest road to the incident'", m.stripName === "Nearest road to the incident", m.stripName);
      ok("low active: the safety banner is shown", /Active incident\. Keep a safe distance\. Call 112/.test(m.bannerText ?? ""), m.bannerText);
      ok("low active: layout (no overlap, no clipped text)", m.overlaps.length === 0 && m.clippedText.length === 0, [...m.overlaps, ...m.clippedText].join("; "));
      const used = m.instruction.height + m.strip.height + 28;
      ok("low active: collapsed panels (card + strip + banner) at most 30% of the screen", used <= 0.3 * m.vh, `${((100 * used) / m.vh).toFixed(1)}%`);
      ok("low active: the map keeps at least half of its height", m.strip.top - m.instruction.bottom >= 0.5 * m.card.height, `${Math.round(m.strip.top - m.instruction.bottom)}px of ${Math.round(m.card.height)}px`);
      const sheet = await sheetText();
      ok("low active: the directions list carries the full warning and ends at the nearest road", /This is an active incident\. Keep a safe distance\. If you are in danger, call 112\./.test(sheet) && /arrived at the nearest road to the incident/.test(sheet), "");
      await shot("1-low-active");

      // 2. a critical active incident: confirmation
      await page.goto(`${base}/map?navigate=incident:${CRITICAL._id}`, { waitMs: 1200 });
      await page.waitFor(`!!document.querySelector('[role=alertdialog]')`, 30000);
      m = await measure();
      ok("critical: 'Navigate to an active incident?' is asked before any route", m.dialog && /Navigate to an active incident\?/.test(m.dialogText) && !m.strip, "");
      ok("critical: the dialog carries the safety text and fits", /call 112/.test(m.dialogText) && m.overlaps.length === 0 && m.clippedText.length === 0, [...m.overlaps, ...m.clippedText].join("; "));
      await shot("2-critical-confirm");
      await click("Cancel");
      await sleep(1200);
      m = await measure();
      ok("critical: Cancel closes it and no route starts", !m.dialog && !m.strip);
      await page.goto(`${base}/map?navigate=incident:${CRITICAL._id}`, { waitMs: 1200 });
      await page.waitFor(`!!document.querySelector('[role=alertdialog]')`, 30000);
      await click("Continue");
      await page.waitFor(`!!document.querySelector('[data-nav=strip]')`, 30000);
      await sleep(800);
      m = await measure();
      ok("critical: Continue starts the route to the nearest road", !m.dialog && m.stripName === "Nearest road to the incident", m.stripName);
      await shot("3-critical-route");

      // 3. a resolved incident: no warning
      await open(`/map?navigate=incident:${RESOLVED._id}`);
      m = await measure();
      ok("resolved (critical): no confirmation, no safety banner", !m.dialog && !/Active incident/.test(m.bannerText ?? ""), m.bannerText ?? "none");
      ok("resolved: no active-incident warning in the list", !/This is an active incident/.test(await sheetText()));

      // 4. an incident inside its own danger zone
      // (a high severity active incident asks first)
      await page.goto(`${base}/map?navigate=incident:${OWN_ZONE._id}`, { waitMs: 1200 });
      await page.waitFor(`!!document.querySelector('[role=alertdialog]')`, 30000);
      await click("Continue");
      await page.waitFor(`!!document.querySelector('[data-nav=strip]')`, 30000);
      await sleep(900);
      m = await measure();
      const own = await sheetText();
      ok("own zone (flood, high): the route is found, and says nothing about passing the incident itself", !!m.strip && !/No route that avoids/.test(own) && !/Passes an active incident/.test(own), "");
      ok("own zone: the active warning is still there", /This is an active incident/.test(own));
      ok("own zone: the banner is not 'No route avoids reported danger'", !/No route avoids/.test(m.bannerText ?? ""), m.bannerText);

      // 5. outside coverage
      await open(`/map?navigate=incident:fake-far`, false);
      await page.waitFor(`!!document.querySelector('[aria-label="Road directions"]')`, 30000);
      m = await measure();
      ok("outside coverage: no road route, the reason and a straight line are shown", !m.strip && /No road directions to this incident/.test(m.fallbackText) && /300 m/.test(m.fallbackText) && /(km|m) .*of you/.test(m.fallbackText), (m.fallbackText ?? "").replace(/\s+/g, " ").slice(0, 160));
      ok("outside coverage: layout", m.overlaps.length === 0 && m.clippedText.length === 0, [...m.overlaps, ...m.clippedText].join("; "));
      await shot("4-outside-coverage");

      // 6. the map popup
      await page.goto(`${base}/map?focus=incident:${LOW._id}`, { waitMs: 1500 });
      await page.waitFor(`!!document.querySelector('.maplibregl-popup')`, 30000);
      ok("popup: an incident popup has 'Navigate here'", await page.eval(`[...document.querySelectorAll('.maplibregl-popup button')].some((b) => b.textContent.trim() === 'Navigate here')`));
      await shot("5-popup");
      await click("Navigate here");
      await page.waitFor(`!!document.querySelector('[data-nav=strip]')`, 30000);
      ok("popup: pressing it starts the route", true);
      await click("Stop");
      await sleep(500);

      // 7. a shelter is unchanged
      await page.goto(`${base}/map`, { waitMs: 1500 });
      await page.waitFor(`document.querySelectorAll('.rn-marker').length >= 5`, 30000);
      await click("Navigate to nearest shelter");
      await page.waitFor(`!!document.querySelector('[data-nav=strip]')`, 30000);
      m = await measure();
      ok("shelter navigation unchanged: strip shows a shelter name, no incident banner", m.stripName !== "Nearest road to the incident" && !/Active incident/.test(m.bannerText ?? ""), m.stripName);
    } catch (error) {
      ok(`script error: ${error.message}`, false);
    } finally {
      await page.close().catch(() => {});
    }
  }
} finally {
  await chrome.close();
  fs.rmSync(PROFILE, { recursive: true, force: true });
}
console.log(`\n${results.filter(Boolean).length} of ${results.length} incident navigation checks passed. Screenshots: ${SHOTS}`);
process.exit(results.every(Boolean) ? 0 : 1);
