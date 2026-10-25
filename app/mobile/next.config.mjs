// Next.js config for the Android app's static export. scripts/build-mobile.mjs
// copies this file over next.config.mjs inside a scratch copy of the app, so the
// website's own config (security headers, the cross-site guard's body limit) is
// never touched and never applies here.
//
//   output: "export"        plain HTML, JS and CSS files, no server. The copy has
//                           no app/api and no proxy.js, so no API routes get in.
//   trailingSlash: true     /settings -> settings/index.html, a path the app's
//                           built-in file server finds without any rewrite rules
//   images.unoptimized      the default image optimizer needs a server (the app
//                           has no <Image> today; this keeps it that way safe)
//
// Cache Components and partial prefetching, which the website uses, are left out:
// Next.js refuses them with a static export ("PPR cannot be enabled in export
// mode"). Every page here is plain static HTML anyway.

const rules = {
  "*.css": {
    loaders: ["@tailwindcss/turbopack"],
    as: "*.css",
  },
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  turbopack: {
    // node_modules lives in app/, two levels above the scratch copy.
    root: process.env.RESCUENET_APP_ROOT || undefined,
    rules,
  },
};

export default nextConfig;
