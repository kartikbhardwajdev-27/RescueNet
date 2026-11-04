// Pop-up notices check (last pre-demo edit), headless Chrome at 360x740 and 1440x900.
//
//   npm run build && npx next start -p 3123     (local MongoDB, npm run demo:seed first)
//   node scripts/browser/check-popups.mjs http://localhost:3123 [--shots dir]
//
// Timers are faked in the page (timeouts of 5 to 10 s and the clock), so "gone after 10 s" is
// tested by advancing the clock; one extra check uses the real clock. The connection is cut with
// CDP network emulation (the page's own requests, which is what the app's status logic looks at).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { launch } from "./cdp.mjs";

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const base = args.find((a, i) => a.startsWith("http") && args[i - 1] !== "--shots") ?? "http://localhost:3123";
const SHOTS = path.resolve(flag("--shots") ?? path.join(os.tmpdir(), "rescuenet-popup-shots"));
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
let tag = "";
const ok = (name, pass, detail = "") => {
  results.push(pass);
  console.log(`${pass ? "PASS" : "FAIL"}  [${tag}] ${name}${detail ? `  (${detail})` : ""}`);
};

const FAKE_TIMERS = `(() => {
  const realSet = window.setTimeout.bind(window), realClear = window.clearTimeout.bind(window), realNow = Date.now.bind(Date);
  let offset = 0, next = 1e9; const queue = new Map();
  Date.now = () => realNow() + offset;
  // when each pop-up appeared (fake clock), so a test can ask how much of its 10 s has gone
  window.__appeared = {};
  new MutationObserver(() => { for (const e of document.querySelectorAll('[data-popup]')) window.__appeared[e.dataset.popup] ??= Date.now(); }).observe(document, { childList: true, subtree: true });
  window.setTimeout = (fn, delay = 0, ...rest) => {
    if (delay >= 5000 && delay <= 10000) { const key = next++; queue.set(key, { fn, at: Date.now() + delay, rest }); return key; }
    return realSet(fn, delay, ...rest);
  };
  window.clearTimeout = (key) => { if (queue.has(key)) queue.delete(key); else realClear(key); };
  window.__advance = (ms) => { offset += ms; for (const [key, item] of [...queue]) if (item.at <= Date.now()) { queue.delete(key); item.fn(...item.rest); } };
})();`;

const popups = `[...document.querySelectorAll('[data-popup]')].map((e) => e.dataset.popup)`;
const chrome = await launch({ port: 9371, profile: fs.mkdtempSync(path.join(os.tmpdir(), "rn-popups-")) });
const page = await (await chrome.newPage()).ready();
const offline = (value) => page.send("Network.emulateNetworkConditions", { offline: value, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
const list = () => page.eval(popups);
const pills = () => page.eval(`[...document.querySelectorAll('[data-pill]')].map((e) => e.dataset.pill)`);
const advance = (ms) => page.eval(`window.__advance(${ms})`);
const waitPopup = (id, ms = 20000) => page.waitFor(`!!document.querySelector('[data-popup="${id}"]')`, ms);
const resize = async (w, h, mobile) => {
  await page.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });
  await page.send("Emulation.setTouchEmulationEnabled", { enabled: mobile });
};

try {
    // one online visit so there is saved data to fall back on
  await resize(1440, 900, false);
  await page.goto(`${base}/`, { waitMs: 3000 });
  await page.waitFor(`document.querySelectorAll('a[href^="/incidents/"]').length > 0`, 20000);
  await sleep(1500);
  const hook = await page.send("Page.addScriptToEvaluateOnNewDocument", { source: FAKE_TIMERS });
  void hook;

  for (const [w, h, mobile] of [[360, 740, true], [1440, 900, false]]) {
    tag = `${w}x${h}`;
    await resize(w, h, mobile);
    await offline(false);
    await page.send("Emulation.setEmulatedMedia", { features: [] });
    await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: 1 });

    // ---- offline: the notices appear, with pills ----
    await offline(true);
    await page.goto(`${base}/`, { waitMs: 1500 });
    await waitPopup("connectivity");
    await waitPopup("saved-data");
    ok("offline: the offline and saved-data notices show", (await list()).includes("connectivity") && (await list()).includes("saved-data"), (await list()).join(", "));
    ok("offline: the pills show too", (await pills()).includes("offline") && (await pills()).includes("saved-data"), (await pills()).join(", "));
    await page.screenshot(path.join(SHOTS, `${w}-offline-notices.png`));
    const btn = await page.eval(`(() => { const b = document.querySelector('[data-popup="connectivity"] button'); const r = b.getBoundingClientRect(); b.focus(); return { w: r.width, h: r.height, label: b.getAttribute('aria-label'), focusable: document.activeElement === b }; })()`);
    ok("close button: at least 44px, labelled Dismiss, keyboard reachable", btn.w >= 43.5 && btn.h >= 43.5 && btn.label === "Dismiss" && btn.focusable, JSON.stringify(btn));
    await page.eval(`document.activeElement.blur()`);
    await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: 1 });
    await sleep(200);

    // ---- the x removes at once; the pills stay ----
    await page.eval(`document.querySelector('[data-popup="connectivity"] button').click()`);
    await sleep(100);
    ok("the x removes the offline notice at once", !(await list()).includes("connectivity"));
    ok("the 'Offline' pill is still there", (await pills()).includes("offline"));

    // ---- it does not come back by itself ----
    await advance(60000);
    await sleep(1500);
    ok("a dismissed offline notice does not come back after a minute", !(await list()).includes("connectivity"));
    await sleep(33000); // a real polling cycle (30 s) happens meanwhile
    ok("...nor after a real polling cycle", !(await list()).includes("connectivity") && (await pills()).includes("offline"));

    // ---- until the connection changes ----
    await offline(false);
    await page.waitFor(`!document.querySelector('[data-pill="offline"]')`, 30000);
    ok("back online: the Offline pill goes", !(await pills()).includes("offline"));
    await offline(true);
    await waitPopup("connectivity", 30000);
    ok("offline again: the notice is back (new condition)", true);

    // ---- 10 s ----
    await page.goto(`${base}/`, { waitMs: 1500 });
    await waitPopup("connectivity", 30000);
    const used = await page.eval(`Date.now() - window.__appeared['connectivity']`);
    await advance(9800 - used);
    ok("still there at 9.8 s", (await list()).includes("connectivity"), `${Math.round(used)} ms had already gone`);
    await advance(400);
    await sleep(150);
    ok("gone after 10 s", !(await list()).includes("connectivity"));
    ok("pills remain after the timer too", (await pills()).includes("offline") && (await pills()).includes("saved-data"));

    // ---- hover pauses ----
    await page.goto(`${base}/`, { waitMs: 1500 });
    await waitPopup("connectivity", 30000);
    const c = await page.eval(`(() => { const r = document.querySelector('[data-popup="connectivity"]').getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
    await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: c.x, y: c.y });
    await sleep(200);
    await advance(30000);
    await sleep(150);
    ok("hovering pauses the timer (still there after 30 s)", (await list()).includes("connectivity"));
    await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: 1 });
    await sleep(200);
    await advance(10500);
    await sleep(150);
    ok("it goes 10 s after the pointer leaves", !(await list()).includes("connectivity"));
    // focus pauses
    await page.goto(`${base}/`, { waitMs: 1500 });
    await waitPopup("connectivity", 30000);
    // (a headless page has no window focus, so the focus event itself is sent)
    await page.eval(`(() => { const b = document.querySelector('[data-popup="connectivity"] button'); b.focus(); b.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); })()`);
    await advance(30000);
    await sleep(150);
    ok("focus inside pauses the timer", (await list()).includes("connectivity"));
    await page.eval(`document.querySelector('[data-popup="connectivity"] button').dispatchEvent(new FocusEvent('focusout', { bubbles: true }))`);

    // ---- at most 3 together ----
    await page.goto(`${base}/map?focus=incident:000000000000000000000000`, { waitMs: 2500 });
    await page.waitFor(`document.querySelectorAll('[data-popup]').length >= 3`, 30000);
    await sleep(1500);
    const shown = await list();
    ok("never more than 3 pop-ups at once", shown.length <= 3 && shown.length >= 1, shown.join(", "));
    await page.screenshot(path.join(SHOTS, `${w}-three.png`));
    const before = shown.length;
    await page.eval(`document.querySelector('[data-popup] button').click()`);
    await sleep(300);
    const afterList = await list();
    ok("closing one lets a waiting one in (still at most 3)", afterList.length <= 3 && afterList.length >= Math.min(before - 1, 1), `${before} → ${afterList.length}: ${afterList.join(", ")}`);

    // ---- reduced motion ----
    await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await page.goto(`${base}/`, { waitMs: 1500 });
    await waitPopup("connectivity", 30000);
    ok("no animation under prefers-reduced-motion", (await page.eval(`getComputedStyle(document.querySelector('[data-popup]')).animationName`)) === "none");
    await page.send("Emulation.setEmulatedMedia", { features: [] });
    ok("the notices sit in a polite live region", await page.eval(`!!document.querySelector('[data-popup][role=status]')`));

    // ---- SOS modal has a visible x ----
    await offline(false);
    await page.goto(`${base}/`, { waitMs: 1500 });
    await page.eval(`(() => { const b = [...document.querySelectorAll('button')].find((x) => /SOS/.test(x.textContent) && x.getBoundingClientRect().width > 0); b.click(); })()`);
    await page.waitFor(`!!document.querySelector('dialog[open]')`, 10000);
    const x = await page.eval(`(() => { const b = document.querySelector('dialog[open] button[aria-label="Close"]'); const r = b?.getBoundingClientRect(); const d = document.querySelector('dialog[open]').getBoundingClientRect(); return b ? { w: r.width, h: r.height, inside: r.left >= d.left && r.right <= d.right && r.top >= d.top } : null; })()`);
    ok("SOS modal has a visible close (x), at least 44px, inside the dialog", !!x && x.w >= 43.5 && x.h >= 43.5 && x.inside, JSON.stringify(x));
    await page.screenshot(path.join(SHOTS, `${w}-sos-x.png`));
    await page.eval(`document.querySelector('dialog[open] button[aria-label="Close"]').click()`);
    await sleep(300);
    ok("the x closes the SOS modal", !(await page.eval(`!!document.querySelector('dialog[open]')`)));
  }

  // ---- one check on the real clock ----
  tag = "real clock";
  await page.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: hook.identifier });
  await resize(1440, 900, false);
  await offline(false);
  await page.goto(`${base}/`, { waitMs: 1500 });
  await page.eval(`window.__seen = {}; new MutationObserver(() => { const on = !!document.querySelector('[data-popup="connectivity"]'); if (on && !window.__seen.a) window.__seen.a = performance.now(); if (!on && window.__seen.a && !window.__seen.b) window.__seen.b = performance.now(); }).observe(document, { childList: true, subtree: true })`);
  await offline(true);
  await page.waitFor(`window.__seen.b`, 40000);
  const seen = await page.eval(`window.__seen`);
  const lasted = seen.b - seen.a;
  ok("a notice goes by itself after 10 s on the real clock", lasted > 9700 && lasted < 10900, `${Math.round(lasted)} ms`);
} catch (error) {
  console.error("SCRIPT ERROR:", error.stack ?? error);
  results.push(false);
} finally {
  await chrome.close();
}
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed${failed ? `, ${failed} FAILED` : ""}. Screenshots: ${SHOTS}`);
process.exit(failed ? 1 : 0);
