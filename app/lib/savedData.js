// The last good answers for the lists the app shows (incidents, shelters, events,
// stats), kept on the device so a screen can still show something when the
// server cannot be reached.
//
// This is the website's version, and the website keeps nothing: every function
// here does nothing, so a page there behaves exactly as it did before. The Android
// app is built with mobile/overlay/lib/savedData.js in its place
// (scripts/build-mobile.mjs), which keeps them in IndexedDB. Keep the exports
// identical.

// What lib/api.js's reads call:
//   savedEpoch()                         a number that changes whenever the saved
//                                        data is cleared (read it BEFORE a request)
//   rememberResponse(path, data, epoch)  keep `data` as the latest answer for `path`,
//                                        unless the saved data was cleared since `epoch`
//   recallResponse(path)                 -> { data, savedAt } (savedAt in ms) or null
//   forgetSavedData()                    throw it all away (logout)
export const savedEpoch = () => 0;
export async function rememberResponse() {}
export async function recallResponse() {
  return null;
}
export async function forgetSavedData() {}
