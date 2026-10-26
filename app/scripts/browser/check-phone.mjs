// The phone-sized navigation layout, measured in headless Chrome at three phone sizes
// (360x740, 390x844, 412x915) with a route on screen. Step 27.
//
//   npm run build && npm run start:lan          (the production server, with the demo data:
//                                                npm run demo:seed)
//   npm run check:phone                         http://localhost:3000
//   npm run check:phone -- http://localhost:3110 --shots /tmp/shots
//
// For each size it uses getBoundingClientRect() to check: no two interactive elements overlap,
// no text is clipped, the collapsed panels (instruction card + strip) take at most 30% of the
// screen's height, the map keeps at least half of its own height, the directions sheet takes at
// most 45% of the screen and scrolls inside itself, the tab bar and SOS button can still be
// tapped, the off-route banner is small and goes away after the reroute, the filters, legend and
// "Navigate to nearest shelter" are hidden during navigation and come back on Stop, and the safe-area
// insets are respected. Screenshots are saved. The position is faked (DevTools), not real GPS.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "./cdp.mjs";
import { createRouter } from "../../lib/routing/engine.js";
import { decodeGraphFile } from "../../lib/routing/format.js";
import { zonesFromIncidents } from "../../lib/routing/zones.js";

const args = process.argv.slice(2);
const shotsFlag = args.indexOf("--shots");
const base = args.find((a, i) => !a.startsWith("--") && i !== shotsFlag + 1) ?? "http://localhost:3000";
const origin = new URL(base).origin;
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = shotsFlag >= 0 ? path.resolve(args[shotsFlag + 1]) : path.join(os.tmpdir(), "rescuenet-phone-shots");
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

// ---- measuring helpers, run inside the page ----

const MEASURE = `(() => {
  const vw = innerWidth, vh = innerHeight;
  // The part of an element that can actually be seen: its box cut down by every ancestor that clips.
  const clipped = (el) => {
    let r = el.getBoundingClientRect();
    let box = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    for (let a = el.parentElement; a; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
        const ar = a.getBoundingClientRect();
        if (cs.overflowX !== 'visible') { box.left = Math.max(box.left, ar.left); box.right = Math.min(box.right, ar.right); }
        if (cs.overflowY !== 'visible') { box.top = Math.max(box.top, ar.top); box.bottom = Math.min(box.bottom, ar.bottom); }
      }
    }
    box.left = Math.max(box.left, 0); box.top = Math.max(box.top, 0); box.right = Math.min(box.right, vw); box.bottom = Math.min(box.bottom, vh);
    return box;
  };
  const area = (b) => Math.max(0, b.right - b.left) * Math.max(0, b.bottom - b.top);
  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    if (el.closest('[aria-hidden="true"], [hidden], .sr-only')) return false;
    return area(clipped(el)) > 0;
  };
  const label = (el) => (el.getAttribute('aria-label') || el.textContent || el.title || el.tagName).trim().replace(/\\s+/g, ' ').slice(0, 40);

  // Interactive elements on the page, except the map's own markers and controls (they are the map).
  const interactive = [...document.querySelectorAll('button, a[href], input, select, textarea, [role=radio], [role=button], [role=link]')]
    .filter((el) => !el.closest('.rn-marker, .maplibregl-canvas-container, .maplibregl-ctrl-attrib, .maplibregl-popup, .maplibregl-ctrl-top-right, .maplibregl-ctrl-top-left, .maplibregl-ctrl-bottom-left'))
    .filter(visible)
    .map((el) => ({ el, label: label(el), box: clipped(el) }));
  const overlaps = [];
  for (let i = 0; i < interactive.length; i++) for (let j = i + 1; j < interactive.length; j++) {
    const a = interactive[i], b = interactive[j];
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const w = Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left);
    const h = Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top);
    if (w > 1 && h > 1) overlaps.push(a.label + ' x ' + b.label + ' (' + Math.round(w) + 'x' + Math.round(h) + ')');
  }

  // Text that is cut off by a box that clips (or by the edge of the screen). Intentional truncation is marked
  // with data-truncates (one line, ellipsis) or data-clamp (at most N lines) and judged separately.
  const clippedText = [];
  const judged = [];
  const scope = [...document.querySelectorAll('[data-nav], nav[aria-label="Primary"], header, [aria-label="Road directions"], [aria-label="Nearest shelter"], .rn-map [role=status], .rn-map [role=group], .rn-map ul[aria-label=Legend]')];
  const seen = new Set();
  for (const root of scope) for (const el of [root, ...root.querySelectorAll('*')]) {
    if (seen.has(el)) continue; seen.add(el);
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own || !visible(el)) continue;
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.3;
    if (el.hasAttribute('data-truncates')) {
      judged.push({ kind: 'truncates', text: el.textContent.trim(), lines: Math.round(el.clientHeight / lineHeight), title: el.title, overflows: el.scrollWidth > el.clientWidth + 1 });
      continue;
    }
    if (el.hasAttribute('data-clamp')) {
      judged.push({ kind: 'clamp', text: el.textContent.trim(), lines: Math.round(el.clientHeight / lineHeight), clamped: el.scrollHeight > el.clientHeight + 1, title: el.title });
      continue;
    }
    const r = el.getBoundingClientRect();
    const b = clipped(el);
    const inScroller = !!el.closest('#nav-sheet');
    // Horizontally, nothing may ever be cut. Vertically, items scrolled out of a scroll box are by design.
    const cutX = r.width - (b.right - b.left) > 1.5;
    const cutY = !inScroller && r.height - (b.bottom - b.top) > 1.5;
    const own2 = el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible';
    if (cutX || cutY || own2) clippedText.push(label(el) + ' [' + Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' visible ' + Math.round(b.right - b.left) + 'x' + Math.round(b.bottom - b.top) + ']');
  }

  const rect = (sel) => { const e = document.querySelector(sel); if (!e || !visible(e)) return null; const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
  return {
    vw, vh,
    docScrolls: document.scrollingElement.scrollHeight > vh + 1,
    scrollY: scrollY,
    card: rect('.rn-map'),
    instruction: rect('[data-nav=instruction]'),
    strip: rect('[data-nav=strip]'),
    sheet: rect('#nav-sheet'),
    locate: rect('button[aria-label="My location"], button[aria-label="Re-centre on me"]'),
    locateLabel: document.querySelector('button[aria-label="My location"], button[aria-label="Re-centre on me"]')?.getAttribute('aria-label') ?? null,
    banner: rect('[data-banner], [data-nav=instruction] ~ div [role=status], [data-nav=instruction] ~ div button'),
    bannerText: document.querySelector('[data-banner]')?.textContent.trim() ?? null,
    tabbar: rect('nav[aria-label=Primary]'),
    topbar: rect('header'),
    attribution: rect('.maplibregl-ctrl-attrib'),
    overlaps, clippedText, judged,
    count: interactive.length,
  };
})()`;

const TABBAR_REACHABLE = `(() => {
  const out = [];
  for (const el of document.querySelectorAll('nav[aria-label=Primary] a, nav[aria-label=Primary] button, header button, header a')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    out.push({ label: (el.getAttribute('aria-label') || el.textContent).trim().slice(0, 20), reachable: hit === el || el.contains(hit) });
  }
  return out;
})()`;

const SETTINGS = [
  [360, 740, 3],
  [390, 844, 3],
  [412, 915, 2.625],
];

const router = createRouter(await decodeGraphFile(fs.readFileSync(path.join(appRoot, "public", "routing", "tricity-roads.rnrg"))));
const shelters = await (await fetch(`${base}/api/shelters`)).json();
const incidentsJson = await (await fetch(`${base}/api/incidents`)).json();
const zones = zonesFromIncidents(incidentsJson.incidents ?? incidentsJson);
const shelterList = shelters.shelters ?? shelters;

const chrome = await launch({ profile: PROFILE, port: 9339 });
try {
  for (const [w, h, dpr] of SETTINGS) {
    currentSize = `${w}x${h}`;
    const page = await (await chrome.newPage()).ready();
    const set = (lat, lon) => page.send("Emulation.setGeolocationOverride", { latitude: lat, longitude: lon, accuracy: 10 });
    const click = (t) => page.eval(`(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.getAttribute('aria-label') || x.textContent).trim().startsWith(${JSON.stringify(t)})); if (!b) return false; b.click(); return true; })()`);
    const measure = () => page.eval(MEASURE);
    const shot = (name) => page.screenshot(`${SHOTS}/${w}x${h}-${name}.png`);
    try {
      await page.send("Browser.grantPermissions", { origin, permissions: ["geolocation"] });
      await set(SECTOR17.lat, SECTOR17.lon);
      await page.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: dpr, mobile: true });
      await page.goto(`${base}/map`, { waitMs: 1500 });
      await page.waitFor(`document.querySelectorAll('.rn-marker').length >= 10`, 30000);
      await sleep(600);

      // ---- before any route ----
      let m = await measure();
      ok("idle map: no two interactive elements overlap", m.overlaps.length === 0, m.overlaps.join("; ") || `${m.count} elements`);
      ok("idle map: no clipped text", m.clippedText.length === 0, m.clippedText.join("; "));
      ok("idle map: the page itself does not scroll", !m.docScrolls);
      await shot("1-idle");

      // ---- a route ----
      await click("Navigate to nearest shelter");
      await page.waitFor(`!!document.querySelector('[data-nav=strip]')`, 30000);
      await sleep(1500);
      m = await measure();
      const card = m.card;
      const heightPanels = m.instruction.height + m.strip.height;
      ok("route: instruction card at the top, strip at the bottom of the map", m.instruction.top - card.top < 2 && card.bottom - m.strip.bottom < 2, `card top ${Math.round(m.instruction.top - card.top)}px, strip bottom gap ${Math.round(card.bottom - m.strip.bottom)}px`);
      ok("route: collapsed panels use at most 30% of the viewport height", heightPanels <= 0.3 * m.vh, `${Math.round(heightPanels)}px = ${((100 * heightPanels) / m.vh).toFixed(1)}% (card ${Math.round(m.instruction.height)} + strip ${Math.round(m.strip.height)})`);
      const free = m.strip.top - m.instruction.bottom;
      ok("route: the map keeps at least 50% of the map's height", free >= 0.5 * card.height, `${Math.round(free)}px of ${Math.round(card.height)}px = ${((100 * free) / card.height).toFixed(1)}%`);
      console.log(`      (as a share of the whole screen: ${((100 * free) / m.vh).toFixed(1)}% of ${m.vh}px)`);
      ok("route: no two interactive elements overlap", m.overlaps.length === 0, m.overlaps.join("; ") || `${m.count} elements`);
      ok("route: no clipped text", m.clippedText.length === 0, m.clippedText.join("; "));
      const name = m.judged.find((j) => j.kind === "truncates");
      ok("route: the destination name is one line, with the full name in its tooltip", name && name.lines <= 1 && name.title === name.text, `${name?.text}${name?.overflows ? " (ellipsis)" : ""}`);
      const instr = m.judged.find((j) => j.kind === "clamp");
      ok("route: the instruction takes at most 2 lines", instr && instr.lines <= 2, `${instr?.lines} line(s): ${instr?.text}`);
      ok("route: the page does not scroll", !m.docScrolls && m.scrollY === 0);
      ok("route: the round locate button is on the right edge, above the strip", m.locate && m.locate.right >= card.right - 20 && m.locate.bottom <= m.strip.top && Math.abs(m.locate.width - m.locate.height) < 1, m.locate ? `${Math.round(m.locate.width)}px round, ${Math.round(card.right - m.locate.right)}px from the right edge, ${Math.round(m.strip.top - m.locate.bottom)}px above the strip` : "missing");
      ok("route: the attribution is visible above the strip", m.attribution && m.attribution.bottom <= m.strip.top + 1 && m.attribution.top >= card.top, m.attribution ? `bottom ${Math.round(m.strip.top - m.attribution.bottom)}px above the strip` : "missing");
      const gone = await page.eval(`(() => { const vis = (el) => !!el && el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility !== 'hidden'; return { chips: vis(document.querySelector('[role=group][aria-label="Show on map"]')), legend: vis(document.querySelector('ul[aria-label=Legend]')), nearest: [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Navigate to nearest shelter') && vis(b)) }; })()`);
      ok("route: filter chips, legend and 'Navigate to nearest shelter' are hidden", !gone.chips && !gone.legend && !gone.nearest, JSON.stringify(gone));
      const reach = await page.eval(TABBAR_REACHABLE);
      ok("route: every tab, the SOS button and the top bar buttons can be tapped (nothing covers them)", reach.length >= 6 && reach.every((r) => r.reachable), `${reach.length} checked${reach.some((r) => !r.reachable) ? ", blocked: " + reach.filter((r) => !r.reachable).map((r) => r.label) : ""}`);
      ok("route: the strip ends above the tab bar", m.strip.bottom <= m.tabbar.top, `${Math.round(m.tabbar.top - m.strip.bottom)}px gap`);
      ok("route: it is collapsed by default (no directions list)", !m.sheet);
      await shot("2-route-collapsed");

      // ---- the directions sheet ----
      await click("Show directions");
      await sleep(500);
      m = await measure();
      ok("sheet: opens on tap", !!m.sheet);
      ok("sheet: the strip with the sheet covers at most 45% of the screen", m.strip.height <= 0.45 * m.vh + 1, `${Math.round(m.strip.height)}px = ${((100 * m.strip.height) / m.vh).toFixed(1)}%`);
      const scrolling = await page.eval(`(() => { const s = document.querySelector('#nav-sheet'); const before = s.scrollTop; s.scrollTop = 120; return { scrollable: s.scrollHeight > s.clientHeight + 1, moved: s.scrollTop > before, pageScrollY: scrollY, docScrolls: document.scrollingElement.scrollHeight > innerHeight + 1 }; })()`);
      ok("sheet: it scrolls inside itself and the page stays put", scrolling.scrollable && scrolling.moved && scrolling.pageScrollY === 0 && !scrolling.docScrolls, JSON.stringify(scrolling));
      await page.eval(`document.querySelector('#nav-sheet').scrollTop = 0`);
      await sleep(200);
      m = await measure();
      ok("sheet: no two interactive elements overlap", m.overlaps.length === 0, m.overlaps.join("; "));
      ok("sheet: no clipped text", m.clippedText.length === 0, m.clippedText.join("; "));
      ok("sheet: the instruction card is still on screen", !!m.instruction);
      const reach2 = await page.eval(TABBAR_REACHABLE);
      ok("sheet: tabs and SOS still reachable", reach2.every((r) => r.reachable));
      ok("sheet: the list has steps with distances", (await page.eval(`document.querySelectorAll('#nav-sheet ol li').length`)) >= 5);
      await shot("3-sheet-open");
      await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      await sleep(300);
      ok("sheet: Escape closes it", !(await measure()).sheet);

      // ---- Walk / Drive in the strip ----
      await click("Drive");
      await sleep(1400);
      m = await measure();
      ok("strip: Drive recalculates (the time says by car) and still fits", /by car/.test(await page.eval(`document.querySelector('[data-nav=strip]').innerText`)) && m.overlaps.length === 0 && m.clippedText.length === 0);
      await click("Walk");
      await sleep(1200);

      // ---- Start: following, banners ----
      const target = shelterList.find((s) => /Mohali/.test(s.name));
      const reference = router.route({ from: SECTOR17, to: { lat: target.location.coordinates[1], lon: target.location.coordinates[0] }, profile: "walk", zones });
      const path = reference.coordinates;
      await click("Start");
      await sleep(500);
      ok("Start: the Start button gives way to Stop", !(await page.eval(`[...document.querySelectorAll('[data-nav=strip] button')].some((b) => b.textContent.trim() === 'Start')`)));
      let longest = null;
      const unclamped = [];
      const stops = Array.from({ length: 14 }, (_, i) => Math.min(path.length - 1, Math.round((i * (path.length - 1)) / 13)));
      for (const index of stops.slice(0, -1)) {
        await set(path[index][1], path[index][0]);
        await sleep(950);
        const j = (await measure()).judged.find((x) => x.kind === "clamp");
        if (j) {
          unclamped.push(j);
          if (!longest || j.text.length > longest.text.length) longest = j;
        }
      }
      ok("Start: every instruction along the route fits in at most 2 lines", unclamped.length >= 10 && unclamped.every((j) => j.lines <= 2), `${unclamped.length} instructions seen, longest (${longest?.text.length} chars): "${longest?.text}" in ${longest?.lines} line(s)${unclamped.some((j) => j.clamped) ? ", some are shortened with an ellipsis (full text is in the list)" : ", none shortened"}`);
      await shot("4-following");

      // off route: a small banner under the card
      const mid = path[Math.floor(path.length / 4)];
      await set(mid[1], mid[0]);
      await sleep(1200);
      const east = (metres) => mid[0] + metres / (111195 * Math.cos((mid[1] * Math.PI) / 180));
      await set(mid[1], east(300));
      await sleep(1300);
      m = await measure();
      ok("off route: a small banner under the instruction card says so", m.bannerText === "You are off the route" && m.banner && m.banner.top >= m.instruction.bottom - 1 && m.banner.height <= 40, m.banner ? `${m.bannerText}; ${Math.round(m.banner.height)}px high, ${Math.round(m.banner.top - m.instruction.bottom)}px under the card` : "no banner");
      ok("off route: it is not inside a big panel: collapsed panels still at most 30%", m.instruction.height + m.strip.height + (m.banner?.height ?? 0) <= 0.3 * m.vh, `${(((m.instruction.height + m.strip.height + (m.banner?.height ?? 0)) * 100) / m.vh).toFixed(1)}% with the banner`);
      ok("off route: banner overlaps nothing", m.overlaps.length === 0, m.overlaps.join("; "));
      await shot("5-off-route");
      await set(mid[1], east(305));
      await sleep(1600);
      m = await measure();
      ok("after the reroute the banner is gone", m.bannerText === null && !m.banner, m.bannerText ?? "none");

      // the round button: My location / Re-centre
      ok("round button: says 'My location' while the camera follows", m.locateLabel === "My location", m.locateLabel);
      const canvas = await page.eval(`(() => { const r = document.querySelector('.maplibregl-canvas').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.45 }; })()`);
      await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: canvas.x, y: canvas.y, button: "left", clickCount: 1 });
      for (let i = 1; i <= 6; i++) await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: canvas.x + i * 14, y: canvas.y + i * 6, button: "left" });
      await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: canvas.x + 84, y: canvas.y + 36, button: "left", clickCount: 1 });
      await sleep(500);
      m = await measure();
      ok("round button: after dragging the map it becomes 'Re-centre on me' (one button, not two)", m.locateLabel === "Re-centre on me" && (await page.eval(`document.querySelectorAll('button[aria-label="My location"], button[aria-label="Re-centre on me"]').length`)) === 1, m.locateLabel);
      await click("Re-centre on me");
      await sleep(900);
      ok("round button: pressing it goes back to 'My location'", (await measure()).locateLabel === "My location");

      // ---- Stop ----
      await click("Stop");
      await sleep(800);
      const back = await page.eval(`(() => { const vis = (el) => !!el && el.getBoundingClientRect().width > 0; return { chips: vis(document.querySelector('[role=group][aria-label="Show on map"]')), legend: vis(document.querySelector('ul[aria-label=Legend]')), nearest: [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Navigate to nearest shelter') && vis(b)), strip: !!document.querySelector('[data-nav=strip]') }; })()`);
      ok("Stop: filters, legend and 'Navigate to nearest shelter' come back, the strip is gone", back.chips && back.legend && back.nearest && !back.strip, JSON.stringify(back));
      m = await measure();
      ok("Stop: nothing overlaps again", m.overlaps.length === 0 && m.clippedText.length === 0, [...m.overlaps, ...m.clippedText].join("; "));
      await page.send("Emulation.setGeolocationOverride", { latitude: SECTOR17.lat, longitude: SECTOR17.lon, accuracy: 10 });

      // ---- safe-area insets (what Capacitor injects on Android) ----
      await click("Navigate to nearest shelter");
      await page.waitFor(`!!document.querySelector('[data-nav=strip]')`, 30000);
      await sleep(1000);
      await page.eval(`(() => { const s = document.documentElement.style; s.setProperty('--safe-area-inset-left', '28px'); s.setProperty('--safe-area-inset-right', '28px'); s.setProperty('--safe-area-inset-bottom', '34px'); s.setProperty('--safe-area-inset-top', '44px'); })()`);
      await sleep(400);
      const insets = await page.eval(`(() => {
        const cs = (sel) => { const e = document.querySelector(sel); return e ? getComputedStyle(e) : null; };
        const instr = cs('[data-nav=instruction]'); const stripInner = document.querySelector('[data-nav=strip] > div'); const sic = stripInner ? getComputedStyle(stripInner) : null;
        const text = document.querySelector('[data-nav=instruction] p').getBoundingClientRect();
        const name = document.querySelector('[data-nav=strip] [data-truncates]').getBoundingClientRect();
        const locate = document.querySelector('button[aria-label="My location"], button[aria-label="Re-centre on me"]').getBoundingClientRect();
        return { cardPadLeft: parseFloat(instr.paddingLeft), cardPadRight: parseFloat(instr.paddingRight), stripPadLeft: parseFloat(sic.paddingLeft), stripPadBottom: parseFloat(sic.paddingBottom), textLeft: text.left, nameLeft: name.left, locateRightGap: innerWidth - locate.right };
      })()`);
      ok("safe area: left and right insets are respected by the card and the strip", insets.cardPadLeft >= 28 && insets.cardPadRight >= 28 && insets.stripPadLeft >= 28 && insets.locateRightGap >= 28, JSON.stringify(insets));
      ok("safe area: the bottom inset pads the strip", insets.stripPadBottom >= 34, `${insets.stripPadBottom}px`);
      m = await measure();
      ok("safe area: still no overlap, no clipped text, panels still at most 30% (+ the bottom inset)", m.overlaps.length === 0 && m.clippedText.length === 0 && m.instruction.height + m.strip.height <= 0.3 * m.vh + 34, `${(((m.instruction.height + m.strip.height) * 100) / m.vh).toFixed(1)}%`);
      await shot("6-safe-area");
      await page.eval(`(() => { const s = document.documentElement.style; for (const k of ['left','right','bottom','top']) s.removeProperty('--safe-area-inset-' + k); })()`);
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
console.log(`\n${results.filter(Boolean).length} of ${results.length} phone-layout checks passed. Screenshots: ${SHOTS}`);
process.exit(results.every(Boolean) ? 0 : 1);
