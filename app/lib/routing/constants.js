// Numbers shared by the routing engine (which runs in the worker) and the screens
// (which must not load the engine just to read them).

// A point is snapped to a road only if one is this close; otherwise "outside coverage".
export const SNAP_LIMIT_M = 300;
// Avoid zones: the circle drawn round a dangerous incident, and what a road in one costs.
export const ZONE_RADIUS_M = 200;
export const ZONE_COST_FACTOR = 10;
