// The routing calls a page may make. Kept apart from the service so the page can
// check a name without loading the engine (which only the worker needs).
export const SERVICE_METHODS = ["init", "warm", "snap", "route", "routeToNearest"];
