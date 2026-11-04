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
const SIZES = [[360, 740], [390, 844], [412, 915]];
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
