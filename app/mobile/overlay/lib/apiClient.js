// The Android app's apiFetch. Replaces lib/apiClient.js (the website's plain
// fetch) in the app build; the two must export the same thing.
//
// The request goes to the laptop's address with CapacitorHttp, carrying the
// login token. See lib/native/http.js for why.
import { nativeFetch } from "./native/http";

export function apiFetch(path, init) {
  return nativeFetch(path, init);
}
