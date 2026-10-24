// The web app manifest, served at /manifest.webmanifest. It is what lets a phone
// offer "Add to Home Screen" / "Install app" and open RescueNet full-screen.
// Installing needs a secure origin (https or localhost): see docs/OFFLINE_APP.md.
export default function manifest() {
  return {
    name: "RescueNet",
    short_name: "RescueNet",
    description: "Emergency reports, shelters and SOS, built to keep working without internet.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Same as --base in app/globals.css, so the launch screen matches the app.
    background_color: "#0b0f1a",
    theme_color: "#0b0f1a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
