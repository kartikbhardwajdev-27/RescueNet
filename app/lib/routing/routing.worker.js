// The Web Worker that does the routing, so a search never freezes the screen.
// A thin shell around the routing service: it receives { id, method, params },
// runs the method, and answers { id, ok, result } or { id, ok: false, error }.

import { SERVICE_METHODS } from "./methods.js";
import { createRoutingService } from "./service.js";

const service = createRoutingService();

self.onmessage = async (event) => {
  const { id, method, params } = event.data ?? {};
  if (!SERVICE_METHODS.includes(method)) {
    self.postMessage({ id, ok: false, error: { code: "bad-request", message: `Unknown routing method "${method}"` } });
    return;
  }
  try {
    self.postMessage({ id, ok: true, result: await service[method](params) });
  } catch (error) {
    self.postMessage({ id, ok: false, error: { code: error.code ?? "failed", message: error.message } });
  }
};
