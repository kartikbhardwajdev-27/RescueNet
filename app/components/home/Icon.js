import {
  BedDouble,
  CircleCheck,
  FilePlus,
  HeartHandshake,
  HousePlus,
  Inbox,
  Info,
  LifeBuoy,
  Route,
  TriangleAlert,
  Waves,
} from "lucide-react";

// Data refers to icons by key, so API data never needs to know about React.
const ICONS = {
  "bed-double": BedDouble,
  "circle-check": CircleCheck,
  "file-plus": FilePlus,
  "heart-handshake": HeartHandshake,
  "house-plus": HousePlus,
  inbox: Inbox,
  "life-buoy": LifeBuoy,
  route: Route,
  "triangle-alert": TriangleAlert,
  waves: Waves,
};

export default function Icon({ name, ...props }) {
  const Glyph = ICONS[name] ?? Info;
  return <Glyph aria-hidden="true" {...props} />;
}
