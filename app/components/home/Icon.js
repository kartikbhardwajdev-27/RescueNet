import {
  FilePlus,
  HeartHandshake,
  HousePlus,
  Info,
  LifeBuoy,
  Route,
  TriangleAlert,
  Waves,
} from "lucide-react";

// Data refers to icons by key, so API data never needs to know about React.
const ICONS = {
  "file-plus": FilePlus,
  "heart-handshake": HeartHandshake,
  "house-plus": HousePlus,
  "life-buoy": LifeBuoy,
  route: Route,
  "triangle-alert": TriangleAlert,
  waves: Waves,
};

export default function Icon({ name, ...props }) {
  const Glyph = ICONS[name] ?? Info;
  return <Glyph aria-hidden="true" {...props} />;
}
