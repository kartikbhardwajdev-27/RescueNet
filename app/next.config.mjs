const isDev = process.env.NODE_ENV === "development";

// Content-Security-Policy: everything must come from this same origin. That is
// the offline rule ("no CDN, no external URLs") enforced by the browser, not just
// followed by us. The few exceptions are what the map needs:
//   worker-src / child-src blob:   MapLibre starts its tile workers from blob URLs
//   img-src data: blob:            map icons and decoded tiles
//   style-src 'unsafe-inline'      React and MapLibre set style attributes
//   script-src 'unsafe-inline'     Next.js writes small inline scripts into every page
//                                  (a nonce would avoid this but forces every page to
//                                  be rendered per request, which the saved offline
//                                  pages cannot be; see docs/SECURITY.md)
// Development also needs eval and a websocket for hot reload. There is
// deliberately no upgrade-insecure-requests: the app is served over plain http
// on the local network.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "manifest-src 'self'",
  "media-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  // Location is the only feature the app uses (SOS, "Use my location").
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=(), payment=(), usb=(), bluetooth=(), serial=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  // No Strict-Transport-Security: the app runs over plain http on the local
  // network, and a browser that has seen HSTS for "localhost" or a LAN address
  // would refuse to open it again.
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // No "X-Powered-By: Next.js" header.
  poweredByHeader: false,
  experimental: {
    // proxy.js (the cross-site guard) buffers request bodies; nothing the app
    // accepts is anywhere near this big (see MAX_BODY_BYTES in lib/http.js).
    proxyClientMaxBodySize: "64kb",
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
