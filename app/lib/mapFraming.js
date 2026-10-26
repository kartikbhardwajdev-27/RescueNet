// Framing the map on something (the route, the person and a shelter, all the pins): how much
// room to keep clear of the panels laid over the map. Pure, so it is checked in
// scripts/check-navigation.mjs.
//
// The map on a small phone is only about 530 px tall. Asking MapLibre to keep 530 px clear
// leaves it nothing to draw in, and it throws ("Invalid LngLat"), which took the whole page
// down. So the padding is capped: top and bottom together may take at most `maxShare` of
// the height, left and right together of the width.

export const MAX_PADDING_SHARE = 0.7;

// padding: { top, bottom, left, right } in pixels. Returns whole pixels, scaled down evenly
// when a pair adds up to more than allowed.
export function limitPadding({ top, bottom, left, right }, width, height, maxShare = MAX_PADDING_SHARE) {
  const scale = (a, b, size) => {
    const allowed = Math.max(0, size * maxShare);
    const total = a + b;
    if (total <= allowed || total === 0) return [Math.floor(a), Math.floor(b)];
    // (the 1e-9 undoes floating-point dust such as 360 * 0.7 = 251.99999999999997)
    return [Math.floor((a * allowed) / total + 1e-9), Math.floor((b * allowed) / total + 1e-9)];
  };
  const [t, b] = scale(top, bottom, height);
  const [l, r] = scale(left, right, width);
  return { top: t, bottom: b, left: l, right: r };
}

// map.fitBounds that can never throw: if the frame cannot be worked out with the padding asked
// for, it tries again with a small even one, and if that fails too it leaves the camera alone.
export function safeFitBounds(map, bounds, options) {
  try {
    map.fitBounds(bounds, options);
    return true;
  } catch {
    try {
      map.fitBounds(bounds, { ...options, padding: 16 });
      return true;
    } catch {
      return false;
    }
  }
}
