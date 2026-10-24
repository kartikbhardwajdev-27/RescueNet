// Whether this browser can draw a MapLibre map (WebGL). The probe context is
// given back straight away: browsers allow only a handful of live contexts, and
// every page with a map would otherwise leave one behind.
export function webglAvailable() {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return Boolean(gl);
  } catch {
    return false;
  }
}
