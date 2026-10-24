// Draws the app icons from the RescueNet logo (a shield with a plus on the
// brand gradient, the same as components/Logo.js) and writes them into the
// project. Run it from app/ with:  npm run icons
//
// Output (all committed, so nobody needs to run this to use the app):
//   public/icons/icon-192.png            manifest icon
//   public/icons/icon-512.png            manifest icon
//   public/icons/icon-maskable-512.png   manifest icon for Android's round/squircle masks
//   public/icons/apple-touch-icon.png    iOS "Add to Home Screen" icon
//   app/favicon.ico                      browser tab icon (16, 32 and 48 px)
//
// It uses `sharp`, which Next.js installs as an optional dependency (it is what
// next/image uses), so no package is added for this. Nothing is downloaded and
// nothing leaves this machine.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Same colours as app/globals.css: --brand-from, --brand-to, --on-brand.
const BRAND_FROM = "#7b6cff";
const BRAND_TO = "#22d3ee";
const ON_BRAND = "#0b0f1a";

// lucide "shield-plus", 24 x 24 grid (node_modules/lucide-react/dist/esm/icons/shield-plus.mjs).
const SHIELD_PLUS = [
  "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
  "M9 12h6",
  "M12 9v6",
];

// cornerRatio: corner radius as a share of the side (0 = full-bleed square).
// glyphRatio: how much of the side the shield takes up.
function logoSvg({ size, cornerRatio, glyphRatio }) {
  const glyph = size * glyphRatio;
  const offset = (size - glyph) / 2;
  const paths = SHIELD_PLUS.map((d) => `<path d="${d}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="brand" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BRAND_FROM}"/>
      <stop offset="1" stop-color="${BRAND_TO}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${size * cornerRatio}" fill="url(#brand)"/>
  <g transform="translate(${offset} ${offset}) scale(${glyph / 24})" fill="none" stroke="${ON_BRAND}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</g>
</svg>`;
}

const png = (options) => sharp(Buffer.from(logoSvg(options))).png().toBuffer();

// An .ico file is a small header plus the images; modern ICO readers accept PNG data.
function packIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map((image) => image.data)]);
}

async function main() {
  const iconsDir = path.join(appRoot, "public", "icons");
  await fs.mkdir(iconsDir, { recursive: true });

  const rounded = { cornerRatio: 0.22, glyphRatio: 0.5 };
  // Android crops maskable icons to a circle or squircle, so the artwork has to
  // sit inside the central 80% and fill the whole square.
  const maskable = { cornerRatio: 0, glyphRatio: 0.4 };
  // iOS rounds the corners itself, so it wants the full square.
  const apple = { cornerRatio: 0, glyphRatio: 0.5 };

  const files = {
    "icon-192.png": await png({ size: 192, ...rounded }),
    "icon-512.png": await png({ size: 512, ...rounded }),
    "icon-maskable-512.png": await png({ size: 512, ...maskable }),
    "apple-touch-icon.png": await png({ size: 180, ...apple }),
  };
  for (const [name, data] of Object.entries(files)) {
    await fs.writeFile(path.join(iconsDir, name), data);
    console.log(`wrote public/icons/${name} (${data.length} bytes)`);
  }

  const sizes = [16, 32, 48];
  const images = await Promise.all(sizes.map(async (size) => ({ size, data: await png({ size, ...rounded }) })));
  const ico = packIco(images);
  await fs.writeFile(path.join(appRoot, "app", "favicon.ico"), ico);
  console.log(`wrote app/favicon.ico (${ico.length} bytes, ${sizes.join("/")} px)`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
