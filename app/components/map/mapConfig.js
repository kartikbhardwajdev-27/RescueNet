import { layers, namedFlavor } from "@protomaps/basemaps";

// Everything the map needs comes from this origin: tiles from /maps, glyphs and
// sprites from /map-assets. Nothing is fetched from the internet at runtime.
// See docs/OFFLINE_MAP.md for how the files are made.

export const PMTILES_PATH = "/maps/tricity.pmtiles";
export const GLYPHS_PATH = "/map-assets/fonts/{fontstack}/{range}.pbf";
export const SPRITE_PATH = "/map-assets/sprites/v4/dark";

// [west, south, east, north] of the extract (--bbox in docs/OFFLINE_MAP.md).
export const COVERAGE_BBOX = [76.6, 30.55, 76.95, 30.85];

// Used when there is nothing to fit: Chandigarh / Mohali / Panchkula.
export const DEFAULT_CENTER = [76.8, 30.65]; // [lng, lat]
export const DEFAULT_ZOOM = 11;

// The extract stops at z14; zooming past that overzooms the same tiles.
export const FIT_MAX_ZOOM = 14;
export const FOCUS_ZOOM = 15;
export const MAX_ZOOM = 18;

export const SOURCE_ID = "protomaps";

// The dashed line to the nearest shelter ("Nearest shelter" on the map).
export const NEAREST_SOURCE = "nearest-shelter-line";
export const NEAREST_LAYER = "nearest-shelter-line";

// MapLibre style: the Protomaps "dark" basemap over the local PMTiles file.
// `origin` makes every URL absolute, because the style is also read inside a
// web worker where relative URLs would not resolve.
export function buildStyle(origin) {
  return {
    version: 8,
    glyphs: `${origin}${GLYPHS_PATH}`,
    sprite: `${origin}${SPRITE_PATH}`,
    sources: {
      [SOURCE_ID]: {
        type: "vector",
        url: `pmtiles://${origin}${PMTILES_PATH}`,
        attribution: "© OpenStreetMap contributors · Protomaps",
      },
    },
    layers: layers(SOURCE_ID, namedFlavor("dark"), { lang: "en" }),
  };
}

// Whether a { lng, lat } point is inside the area the offline tiles cover.
export function insideCoverage({ lng, lat }) {
  const [west, south, east, north] = COVERAGE_BBOX;
  return lng >= west && lng <= east && lat >= south && lat <= north;
}
