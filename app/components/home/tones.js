// Colour meaning is strict: red = emergency/SOS, green = safe/shelter,
// amber = warning, blue = info. Class names are written out in full so
// Tailwind can see them.
const TONES = {
  red: { badge: "bg-sos/15 text-sos-soft", dot: "bg-sos", tint: "from-sos/20" },
  green: { badge: "bg-safe/15 text-safe", dot: "bg-safe", tint: "from-safe/20" },
  amber: { badge: "bg-warn/15 text-warn", dot: "bg-warn", tint: "from-warn/20" },
  blue: { badge: "bg-info/15 text-info", dot: "bg-info", tint: "from-info/20" },
  // Between amber and red: "high" severity on the map.
  orange: { badge: "bg-orange-400/15 text-orange-400", dot: "bg-orange-400", tint: "from-orange-400/20" },
  // Not a meaning, just "inactive" (closed or full shelters).
  muted: { badge: "bg-white/10 text-ink-muted", dot: "bg-ink-muted", tint: "from-white/10" },
};

export function toneClasses(tone) {
  return TONES[tone] ?? TONES.blue;
}
