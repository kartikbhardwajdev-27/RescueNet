// Replaces components/ServiceWorkerRegister.js in the Android app build. The
// website registers a service worker to save its pages for offline use; in the
// app every file is already inside the APK, so there is nothing to save.
export default function ServiceWorkerRegister() {
  return null;
}
