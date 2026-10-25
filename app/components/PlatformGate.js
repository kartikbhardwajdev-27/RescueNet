// Wraps the whole app. On the website it does nothing.
//
// The Android app is built with mobile/overlay/components/PlatformGate.js in its
// place (scripts/build-mobile.mjs): the first-run screen that asks for the
// laptop's address, shown before anything else can run.
export default function PlatformGate({ children }) {
  return children;
}
