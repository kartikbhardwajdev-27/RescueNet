// Step 31 browser checks (pre-demo polish), headless Chrome at three phone sizes.
//
//   npm run build && npx next start -p 3110     (local MongoDB, npm run demo:seed first)
//   node scripts/browser/check-polish.mjs http://localhost:3110 [--part A|B|C|D] [--shots dir]
//
// A  list rows on Home, My reports, Events, Shelters and the queue list: no overlaps, no clipped
//    text, text column at least half of the row, tap targets at least 44px.
// B  Home: no mini-map card, Nearby and Recent activity side by side from 1024px, stacked on phones.
// C  toasts: timeouts, hover pause, close button, at most 3.
// D  Report page "Pick on map".
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { launch } from "./cdp.mjs";

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const base = args.find((a, i) => a.startsWith("http") && args[i - 1] !== "--shots") ?? "http://localhost:3110";
const only = flag("--part");
const SHOTS = path.resolve(flag("--shots") ?? path.join(os.tmpdir(), "rescuenet-polish-shots"));
fs.mkdirSync(SHOTS, { recursive: true });
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "rescuenet-chrome-"));
const SIZES = (flag('--size') ? [flag('--size').split('x').map(Number)] : [[360, 740], [390, 844], [412, 915]]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
let tag = "";
export const ok = (name, pass, detail = "") => {
  results.push(pass);
  console.log(`${pass ? "PASS" : "FAIL"}  [${tag}] ${name}${detail ? `  (${detail})` : ""}`);
};

const chrome = await launch({ port: 9344, profile: PROFILE });
const page = await (await chrome.newPage()).ready();

async function resize(w, h, mobile = true) {
  await page.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await page.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile });
  await page.send("Emulation.setTouchEmulationEnabled", { enabled: mobile });
}
async function login(email, password = "demo-rescuenet-2026") {
  await page.goto(`${base}/login`, { waitMs: 500 });
  const status = await page.eval(`fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:${JSON.stringify(email)},password:${JSON.stringify(password)}})}).then(r=>r.status)`);
  if (status !== 200) throw new Error(`login failed ${status}`);
}

// Rows: every item matching `rowSel`. Returns problems per row.
const ROWS = (rowSel) => `(() => {
  const vw = innerWidth;
  const vis = (el) => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const rows = [...document.querySelectorAll(${JSON.stringify(rowSel)})].filter(vis);
  const out = { count: rows.length, overlaps: [], small: [], clipped: [], narrow: [], overflowX: document.documentElement.scrollWidth > vw + 1 };
  for (const row of rows) {
    const rr = row.getBoundingClientRect();
    const name = (row.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 30);
    const ctrls = [...row.querySelectorAll('a[href], button')].filter(vis);
    for (let i = 0; i < ctrls.length; i++) {
      const a = ctrls[i].getBoundingClientRect();
      if (a.height < 43.5) out.small.push(name + ' / ' + (ctrls[i].textContent || ctrls[i].getAttribute('aria-label') || '').trim().slice(0, 20) + ' h=' + Math.round(a.height));
      for (let j = i + 1; j < ctrls.length; j++) {
        if (ctrls[i].contains(ctrls[j]) || ctrls[j].contains(ctrls[i])) continue;
        const b = ctrls[j].getBoundingClientRect();
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w > 1 && h > 1) out.overlaps.push(name + ' / ' + (ctrls[i].textContent || '').trim().slice(0, 15) + ' x ' + (ctrls[j].textContent || '').trim().slice(0, 15));
      }
    }
    // text paragraphs: must stay inside the row, and the widest text block is at least half the row
    let widest = 0;
    for (const el of row.querySelectorAll('p, span, h3, div')) {
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || !vis(el)) continue;
      const r = el.getBoundingClientRect();
      if (el.closest('button') || el.tagName === 'A') continue;
      widest = Math.max(widest, r.width);
      if (r.right > rr.right + 1 || r.left < rr.left - 1) out.clipped.push(name + ' / outside row');
      if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible') out.clipped.push(name + ' / h-clipped');
    }
    if (widest < rr.width * 0.5) out.narrow.push(name + ' text=' + Math.round(widest) + ' row=' + Math.round(rr.width));
  }
  return out;
})()`;

async function reportRows(label, rowSel) {
  const r = await page.eval(ROWS(rowSel));
  ok(`${label}: rows found`, r.count > 0, `${r.count}`);
  ok(`${label}: no overlapping buttons`, r.overlaps.length === 0, r.overlaps.slice(0, 3).join("; "));
  ok(`${label}: tap targets >= 44px`, r.small.length === 0, r.small.slice(0, 3).join("; "));
  ok(`${label}: nothing clipped`, r.clipped.length === 0, r.clipped.slice(0, 3).join("; "));
  ok(`${label}: text column >= 50% of row`, r.narrow.length === 0, r.narrow.slice(0, 3).join("; "));
  ok(`${label}: no horizontal page scroll`, !r.overflowX);
}

const parts = {
  async D() {
    const rectOf = (sel) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; })()`;
    const coords = () => page.eval(`(() => { const t = document.querySelector('[data-testid=pick-coords]')?.textContent ?? ''; const m = /Latitude ([-\\d.]+), longitude ([-\\d.]+)/.exec(t); return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null; })()`);
    const fields = () => page.eval(`({ lat: document.getElementById('report-lat').value, lng: document.getElementById('report-lng').value })`);
    const mouse = (type, x, y) => page.send("Input.dispatchMouseEvent", { type, x, y, button: type === "mouseMoved" ? "none" : "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });
    const click = async (x, y) => { await mouse("mouseMoved", x, y); await mouse("mousePressed", x, y); await mouse("mouseReleased", x, y); await sleep(250); };
    const setField = async (id, value) => { await page.eval(`(() => { const e = document.getElementById(${JSON.stringify(id)}); const set = Object.getOwnPropertyDescriptor(e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set; set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event('input', { bubbles: true })); })()`); };
    const clickText = (text) => page.eval(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(text)}); if (!b) return false; b.click(); return true; })()`);
    const openPicker = async () => { await clickText("Pick on map"); await page.waitFor(`document.querySelector('[data-testid=pick-map] canvas')`, 20000); await sleep(1500); };
    const near = (a, b, tol) => Math.abs(a - b) <= tol;
    for (const [w, h] of SIZES) {
      tag = `D ${w}x${h}`;
      await resize(w, h);
      await page.send("Emulation.setFocusEmulationEnabled", { enabled: true });
      const before = page.requests.length;
      await page.goto(`${base}/report`, { waitMs: 2500 });
      ok("lazy: no map code or tiles before the button is used", !page.requests.slice(before).some((u) => /tricity\.pmtiles|maplibre/.test(u)));
      ok("Pick on map button >= 44px", await page.eval(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Pick on map'); const r = b?.getBoundingClientRect(); return !!r && r.height >= 43.5; })()`));
      await openPicker();
      ok("map modal opens with a canvas", true);
      const box = await page.eval(rectOf("[data-testid=pick-map]"));
      const dlg = await page.eval(rectOf("[data-testid=pick-location]"));
      ok("sheet fits inside the screen", dlg.left >= -1 && dlg.top >= -1 && dlg.right <= w + 1 && dlg.bottom <= h + 1, `${Math.round(dlg.width)}x${Math.round(dlg.height)}`);
      ok("map is at least 40% of the screen height", box.height >= h * 0.4, `${Math.round(box.height)} of ${h}`);
      if (w <= 412) {
        const nav = await page.eval(`(() => { const n = document.querySelector('nav[aria-label], nav'); const all = [...document.querySelectorAll('nav')].map((n) => n.getBoundingClientRect()).filter((r) => r.height > 0 && r.top > 300); return all[0] ? { top: all[0].top } : null; })()`);
        ok("bottom tab bar (SOS) stays visible below the sheet", !nav || dlg.bottom <= nav.top + 1, nav ? `sheet bottom ${Math.round(dlg.bottom)}, nav top ${Math.round(nav.top)}` : "no nav found");
      }
      ok("Close, title and Use this location are not covered by anything (hit test)", await page.eval(`(() => { const d = document.querySelector('[data-testid=pick-location]'); const els = [d.querySelector('button[aria-label="Close the map"]'), d.querySelector('h2'), [...d.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Use this location')]; return els.every((e) => { const r = e.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return hit && (e === hit || e.contains(hit)); }); })()`));
      ok("Use this location disabled until a point exists", await page.eval(`[...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Use this location').disabled`));
      const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
      // 1. click at the centre: no device location (denied) so the view starts on 30.65, 76.80 at zoom 12
      await click(cx, cy);
      let c = await coords();
      ok("click at the centre gives the default centre (30.65, 76.80)", !!c && near(c.lat, 30.65, 0.003) && near(c.lng, 76.8, 0.003), c ? `${c.lat}, ${c.lng}` : "no coords");
      // 2. marker sits where we clicked; 100 px east = ~0.0172 deg at zoom 12 (360 / (512 * 2^12) per px)
      await click(cx + 100, cy);
      const c2 = await coords();
      ok("100 px east is about 0.0172 deg of longitude (zoom 12, 512 px tiles)", !!c2 && near(c2.lng - c.lng, 0.0172, 0.002) && near(c2.lat, c.lat, 0.002), c2 ? `${(c2.lng - c.lng).toFixed(4)}` : "");
      const m = await page.eval(rectOf(".maplibregl-marker"));
      ok("marker is drawn at the clicked point", !!m && near((m.left + m.right) / 2, cx + 100, 4) && near(m.bottom, cy, 10), m ? `marker x ${Math.round((m.left + m.right) / 2)} y ${Math.round(m.bottom)} vs ${Math.round(cx + 100)},${Math.round(cy)}` : "no marker");
      await page.screenshot(path.join(SHOTS, `D-picker-${w}.png`));
      // 3. drag the marker 60 px right and 40 px down
      const mx = (m.left + m.right) / 2, my = (m.top + m.bottom) / 2;
      await mouse("mouseMoved", mx, my); await mouse("mousePressed", mx, my);
      for (let i = 1; i <= 8; i += 1) { await mouse("mouseMoved", mx + (60 * i) / 8, my + (40 * i) / 8); await sleep(30); }
      await mouse("mouseReleased", mx + 60, my + 40); await sleep(300);
      const c3 = await coords();
      ok("dragging the marker updates the coordinates", !!c3 && near(c3.lng - c2.lng, 0.0103, 0.002) && c3.lat < c2.lat, c3 ? `d lng ${(c3.lng - c2.lng).toFixed(4)}, d lat ${(c3.lat - c2.lat).toFixed(4)}` : "");
      const m3 = await page.eval(rectOf(".maplibregl-marker"));
      ok("marker moved with the drag", near((m3.left + m3.right) / 2, mx + 60, 5) && near((m3.top + m3.bottom) / 2, my + 40, 5));
      // 4. Use this location fills the fields and closes the sheet
      await clickText("Use this location");
      await sleep(300);
      const f = await fields();
      ok("sheet closed", !(await page.eval(`!!document.querySelector('[data-testid=pick-location]')`)));
      ok("fields filled with the picked point", Number(f.lat) === c3.lat && Number(f.lng) === c3.lng, `${f.lat}, ${f.lng}`);
      // 5. typing coordinates moves the marker (the pin starts at the fields' point, centred)
      await setField("report-lat", "30.7398"); await setField("report-lng", "76.7827");
      await openPicker();
      const box5 = await page.eval(rectOf("[data-testid=pick-map]"));
      const m5 = await page.eval(rectOf(".maplibregl-marker"));
      const c5 = await coords();
      ok("typed coordinates are shown in the picker", !!c5 && c5.lat === 30.7398 && c5.lng === 76.7827);
      ok("marker moved to the typed point (map centred on it)", !!m5 && near((m5.left + m5.right) / 2, box5.left + box5.width / 2, 5) && near(m5.bottom, box5.top + box5.height / 2, 10));
      ok("inside the offline area: no outside note", !(await page.eval(`!!document.querySelector('[data-testid=pick-outside]')`)));
      // Escape closes without changing the fields
      await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      await sleep(300);
      ok("Escape closes the sheet and leaves the fields alone", !(await page.eval(`!!document.querySelector('[data-testid=pick-location]')`)) && (await fields()).lat === "30.7398");
      // 6. outside the offline map: a note, but still allowed
      await setField("report-lat", "28.6139"); await setField("report-lng", "77.209");
      await openPicker();
      ok("outside the map area shows a note", await page.eval(`!!document.querySelector('[data-testid=pick-outside]')`));
      ok("...and Use this location is still enabled", !(await page.eval(`[...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Use this location').disabled`)));
      await clickText("Use this location"); await sleep(300);
      const fo = await fields();
      ok("outside point accepted into the fields", fo.lat === "28.6139" && fo.lng === "77.209");
      // 7. submit sends the picked point (the request is answered by the page, nothing is stored)
      await page.eval(`(() => { window.__sent = null; const real = window.fetch; window.fetch = async (input, init) => { const url = typeof input === 'string' ? input : input.url; if (/\\/api\\/incidents(\\?|$)/.test(url) && init?.method === 'POST') { window.__sent = JSON.parse(init.body); return new Response(JSON.stringify({ id: '64b000000000000000000001' }), { status: 201, headers: { 'content-type': 'application/json' } }); } return real(input, init); }; })()`);
      await openPicker();
      const box7 = await page.eval(rectOf("[data-testid=pick-map]"));
      await click(box7.left + box7.width / 2 + 40, box7.top + box7.height / 2 + 40);
      const c7 = await coords();
      await clickText("Use this location"); await sleep(300);
      await page.eval(`document.querySelector('input[name=type][value=fire], input[type=radio]')?.click()`);
      await setField("report-description", "Check: picked point goes out with the report");
      await page.eval(`document.querySelector('form button[type=submit]').click()`);
      await page.waitFor(`window.__sent`, 10000);
      const sent = await page.eval(`window.__sent`);
      ok("submit sends the picked point", !!sent && sent.location.lat === c7.lat && sent.location.lng === c7.lng, sent ? `${sent.location.lat}, ${sent.location.lng}` : "nothing sent");
      // 8. the picker is the same as before for a device with location: it starts on the person
      await page.send("Browser.grantPermissions", { origin: new URL(base).origin, permissions: ["geolocation"] }).catch(() => {});
      await page.send("Emulation.setGeolocationOverride", { latitude: 30.7398, longitude: 76.7827, accuracy: 20 });
      await page.goto(`${base}/report`, { waitMs: 2500 });
      await openPicker(); await sleep(1500);
      const box8 = await page.eval(rectOf("[data-testid=pick-map]"));
      await click(box8.left + box8.width / 2, box8.top + box8.height / 2);
      const c8 = await coords();
      ok("with a device location the picker starts centred on it", !!c8 && near(c8.lat, 30.7398, 0.0015) && near(c8.lng, 76.7827, 0.0015), c8 ? `${c8.lat}, ${c8.lng}` : "no coords");
      await page.send("Emulation.clearGeolocationOverride").catch(() => {});
      await page.send("Browser.resetPermissions", {}).catch(() => {});
      const external = page.requests.filter((u) => /^https?:/.test(u) && new URL(u).origin !== new URL(base).origin);
      ok("no request left this origin", external.length === 0, external.slice(0, 2).join(" "));
    }
  },
  async C() {
    const count = `document.querySelectorAll('[data-toast]').length`;
    const clickRsvp = `(() => { const b = [...document.querySelectorAll('[data-event-id] button')].find((x) => /(Join|Leave)/.test(x.textContent.trim()) && !x.disabled); if (!b) return null; b.click(); return b.textContent.trim(); })()`;
    const toastCenter = `(() => { const t = document.querySelector('[data-toast]'); if (!t) return null; const r = t.getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height / 2 }; })()`;
    const waitGone = async (limitMs) => { const t0 = Date.now(); while (Date.now() - t0 < limitMs) { if ((await page.eval(count)) === 0) return Date.now() - t0; await sleep(100); } return null; };
    const fresh = async () => { await page.goto(`${base}/events`, { waitMs: 2500 }); };
    await login("demo.citizen@rescuenet.test");
    for (const [w, h] of SIZES) {
      tag = `C ${w}x${h}`;
      await resize(w, h);
      await page.send("Emulation.setEmulatedMedia", { features: [] });
      await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: 1 });
      // 1. success toast: stays at ~3 s, gone by ~4.6 s, appears in a polite live region with a close button
      await fresh();
      ok("RSVP click found", !!(await page.eval(clickRsvp)));
      await page.waitFor(`${count} >= 1`, 5000);
      ok("live region is role=status aria-live=polite", await page.eval(`(() => { const r = document.querySelector('[data-toast]')?.parentElement; return r?.getAttribute('role') === 'status' && r?.getAttribute('aria-live') === 'polite'; })()`));
      ok("close button present, >= 44px", await page.eval(`(() => { const b = document.querySelector('[data-toast] button[aria-label="Dismiss notification"]'); const r = b?.getBoundingClientRect(); return !!r && r.width >= 43.5 && r.height >= 43.5; })()`));
      await page.screenshot(path.join(SHOTS, `C-toast-${w}.png`));
      await sleep(3000);
      ok("success toast still there at 3 s", (await page.eval(count)) === 1);
      const gone = await waitGone(2500);
      ok("success toast gone by ~4 s", gone !== null && gone < 2000, gone === null ? "never" : `+${gone}ms after 3 s`);
      // 2. hover pauses
      await fresh();
      await page.eval(clickRsvp);
      await page.waitFor(`${count} >= 1`, 5000);
      const c = await page.eval(toastCenter);
      await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: c.x, y: c.y });
      await sleep(5500);
      ok("hovered toast is still there after 5.5 s", (await page.eval(count)) === 1);
      await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5 });
      const gone2 = await waitGone(5000);
      ok("toast goes after the pointer leaves", gone2 !== null, gone2 === null ? "never" : `${gone2}ms`);
      // 3. focus pauses, and the close button removes it at once
      await fresh();
      await page.eval(clickRsvp);
      await page.waitFor(`${count} >= 1`, 5000);
      await page.eval(`document.querySelector('[data-toast] button').focus()`);
      await sleep(5000);
      ok("focused toast is still there after 5 s", (await page.eval(count)) === 1);
      await page.eval(`document.querySelector('[data-toast] button').click()`);
      await sleep(150);
      ok("close button removes it at once", (await page.eval(count)) === 0);
      // 4. at most 3 at a time
      await fresh();
      for (let i = 0; i < 6; i += 1) { await page.eval(clickRsvp); await sleep(700); }
      const many = await page.eval(count);
      ok("at most 3 toasts at a time", many >= 2 && many <= 3, `${many} shown after 6 clicks`);
      await page.screenshot(path.join(SHOTS, `C-stack-${w}.png`));
      // clean up: leave the event if we joined it
      await sleep(4500);
      // 5. error toast: 7 s. A page-load hook records when the toast appears and disappears,
      //    because the map page's own load event can take longer than the toast lives.
      await page.send("Emulation.setFocusEmulationEnabled", { enabled: false });
      const hook = await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => { window.__t = {}; const seen = () => document.querySelector('[data-toast-kind="error"]'); new MutationObserver(() => { const on = !!seen(); if (on && !window.__t.added) window.__t.added = performance.now(); if (!on && window.__t.added && !window.__t.removed) window.__t.removed = performance.now(); }).observe(document, { childList: true, subtree: true }); })()` });
      await page.goto(`${base}/map?focus=incident:000000000000000000000000`, { waitMs: 500 });
      await page.waitFor(`window.__t && window.__t.removed`, 30000);
      const t = await page.eval(`window.__t`);
      const shown = t.removed - t.added;
      ok("error toast lasts about 7 s", shown > 6700 && shown < 7800, `${Math.round(shown)} ms`);
      await page.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: hook.identifier });
      // 6. reduced motion
      await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
      await fresh();
      await page.eval(clickRsvp);
      await page.waitFor(`${count} >= 1`, 5000);
      ok("no animation under prefers-reduced-motion", (await page.eval(`getComputedStyle(document.querySelector('[data-toast]')).animationName`)) === "none");
    }
    // leave the demo data as we found it: put the demo scene back (join/leave toggled it)
  },
  async B() {
    const cards = `(() => { const h = (t) => [...document.querySelectorAll('h2')].find((e) => e.textContent.trim() === t)?.closest('section, article, div[class*=rounded]'); const n = h('Nearby'), a = h('Recent activity'); if (!n || !a) return null; const r = (e) => e.getBoundingClientRect(); return { n: r(n).toJSON(), a: r(a).toJSON(), vw: innerWidth, overflowX: document.documentElement.scrollWidth > innerWidth + 1, mini: /Live disaster status/i.test(document.body.innerText) }; })()`;
    for (const [w, h, mobile] of [...SIZES.map(([a, b]) => [a, b, true]), [1024, 768, false], [1280, 800, false], [1440, 900, false]]) {
      tag = `B ${w}x${h}`;
      await resize(w, h, mobile);
      await page.goto(`${base}/`, { waitMs: 2500 });
      const c = await page.eval(cards);
      ok("Nearby and Recent activity cards found", !!c);
      if (!c) continue;
      ok("no Live disaster status card", !c.mini);
      ok("no horizontal page scroll", !c.overflowX);
      if (w >= 1024) {
        ok("side by side (same top)", Math.abs(c.n.top - c.a.top) < 2, `tops ${Math.round(c.n.top)} / ${Math.round(c.a.top)}`);
        ok("equal widths", Math.abs(c.n.width - c.a.width) < 2, `${Math.round(c.n.width)} / ${Math.round(c.a.width)}`);
        ok("no gap between columns beyond 24px", c.a.left - c.n.right <= 24 && c.a.left >= c.n.right, `${Math.round(c.a.left - c.n.right)}px`);
        ok("Nearby on the left", c.n.left < c.a.left);
        ok("same height (no empty gap under the shorter card)", Math.abs(c.n.height - c.a.height) < 2, `${Math.round(c.n.height)} / ${Math.round(c.a.height)}`);
      } else {
        ok("stacked, Nearby first", c.a.top >= c.n.bottom - 1 && Math.abs(c.n.left - c.a.left) < 2);
      }
      await page.eval(`document.querySelector('h2')&&[...document.querySelectorAll('h2')].find((e)=>e.textContent.trim()==='Nearby').scrollIntoView({block:'start'})`);
      await page.screenshot(path.join(SHOTS, `B-home-${w}.png`));
    }
  },
  async A() {
    for (const [w, h] of SIZES) {
      tag = `A ${w}x${h}`;
      await resize(w, h);
      await page.goto(`${base}/`, { waitMs: 2500 });
      await reportRows("Home Nearby", "[data-kind]");
      await reportRows("Home Recent activity", "ol > li");
      await page.eval("document.querySelector('[data-kind]')?.scrollIntoView({block:'start'})");
      await page.screenshot(path.join(SHOTS, `A-home-${w}.png`));
      await page.goto(`${base}/shelters`, { waitMs: 2500 });
      await reportRows("Shelters", "article");
      await page.goto(`${base}/events`, { waitMs: 2500 });
      await reportRows("Events", "[data-event-id]");
    }
    await login("demo.citizen@rescuenet.test");
    for (const [w, h] of SIZES) {
      tag = `A ${w}x${h}`;
      await resize(w, h);
      await page.goto(`${base}/account`, { waitMs: 3000 });
      await reportRows("My reports", "#my-reports-heading ~ div ul > li");
      await page.screenshot(path.join(SHOTS, `A-account-${w}.png`));
    }
  },
};
for (const name of Object.keys(parts)) if (!only || only === name) await parts[name]();

console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
await chrome.close();
try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
process.exit(results.every(Boolean) ? 0 : 1);
