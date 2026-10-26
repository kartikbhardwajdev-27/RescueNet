import {
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  CornerDownLeft,
  CornerDownRight,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  Navigation,
  RotateCw,
  Undo2,
} from "lucide-react";

// One icon for each kind of step in the directions (see lib/routing/instructions.js).
const MANEUVER_ICON = {
  depart: Navigation,
  straight: ArrowUp,
  "bear-left": ArrowUpLeft,
  "bear-right": ArrowUpRight,
  left: CornerUpLeft,
  right: CornerUpRight,
  "sharp-left": CornerDownLeft,
  "sharp-right": CornerDownRight,
  uturn: Undo2,
  roundabout: RotateCw,
  "roundabout-exit": ArrowUpRight,
  arrive: Flag,
};

export default function StepIcon({ maneuver, className = "size-5" }) {
  const Icon = MANEUVER_ICON[maneuver] ?? ArrowUp;
  return <Icon className={className} aria-hidden="true" />;
}
