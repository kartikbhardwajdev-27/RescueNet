// Colour meaning is strict: red = emergency/SOS, green = safe/shelter,
// amber = warning, blue = info. Class names are written out in full so
// Tailwind can see them.
const TONES = {
  red: { badge: "bg-sos/15 text-sos-soft", dot: "bg-sos", tint: "from-sos/20" },
  green: { badge: "bg-safe/15 text-safe", dot: "bg-safe", tint: "from-safe/20" },
  amber: { badge: "bg-warn/15 text-warn", dot: "bg-warn", tint: "from-warn/20" },
  blue: { badge: "bg-info/15 text-info", dot: "bg-info", tint: "from-info/20" },
};

export function toneClasses(tone) {
  return TONES[tone] ?? TONES.blue;
}
