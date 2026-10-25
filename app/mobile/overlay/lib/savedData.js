// The Android app's saved data. Replaces lib/savedData.js (which keeps nothing)
// in the app build; the two must export the same functions.
//
// Keeps the last good response of each list the app polls (incidents, shelters,
// events, stats) in IndexedDB, one record per list, and hands it back when the
// laptop cannot be reached, so the app opens to the last thing it knew instead of
// an empty screen. Screens say so ("Saved data from <time>, not live").
//
// Only these four public lists are kept: never the person's own reports or
// events. It is thrown away on logout, when a login stops being valid, and when
// the laptop address changes (the data belongs to that server and that person).
//
// Nothing here ever throws: storage trouble means "nothing saved".

const DB_NAME = "rescuenet-saved";
const STORE = "responses";
const VERSION = 1;

// Must match the paths in lib/api.js.
const SAVED_PATHS = new Set(["/api/stats", "/api/incidents?limit=200", "/api/shelters?limit=200", "/api/events?limit=200"]);

let epoch = 0;
export const savedEpoch = () => epoch;

let dbPromise = null;
function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "path" });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      db.onclose = () => {
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error("Could not open the saved data"));
    request.onblocked = () => reject(new Error("The saved data is blocked"));
  }).catch((err) => {
    dbPromise = null;
    throw err;
  });
  return dbPromise;
}

// Runs `work(store)` in one transaction; resolves with what `work` passes to
// `done`, once the transaction has committed.
async function inTransaction(mode, work) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    let result;
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error("Saved data transaction aborted"));
    work(transaction.objectStore(STORE), (value) => {
      result = value;
    });
  });
}

export async function rememberResponse(path, data, requestEpoch = epoch) {
  if (!SAVED_PATHS.has(path) || data === null || data === undefined) return;
  // Cleared since the request started (a logout while it was in flight): this
  // answer was for the person who just left, so it is not kept.
  if (requestEpoch !== epoch) return;
  try {
    await inTransaction("readwrite", (store) => {
      store.put({ path, data, savedAt: Date.now() });
    });
  } catch {
    // Not saved; the screen simply has nothing to fall back on.
  }
}

export async function recallResponse(path) {
  if (!SAVED_PATHS.has(path)) return null;
  try {
    const record = await inTransaction("readonly", (store, done) => {
      const request = store.get(path);
      request.onsuccess = () => done(request.result ?? null);
    });
    return record ? { data: record.data, savedAt: record.savedAt } : null;
  } catch {
    return null;
  }
}

export async function forgetSavedData() {
  epoch += 1;
  try {
    await inTransaction("readwrite", (store) => {
      store.clear();
    });
  } catch {
    // Nothing to clear, or storage is unavailable.
  }
}
