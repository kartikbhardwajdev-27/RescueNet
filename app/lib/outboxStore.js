// IndexedDB storage for the offline outbox. No libraries: a handful of small
// promise wrappers around one object store.
//
// Every change goes through a single readwrite transaction, and IndexedDB runs
// those one at a time per store. That is what makes `claim` safe when two tabs
// are open: only one of them can move an item from "queued" to "sending".

const DB_NAME = "rescuenet-outbox";
const STORE = "items";
const VERSION = 1;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    let request;
    try {
      request = indexedDB.open(DB_NAME, VERSION);
    } catch (err) {
      reject(err);
      return;
    }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => {
      const db = request.result;
      // Another tab upgrading the database, or the browser reclaiming it.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      db.onclose = () => {
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error("Could not open the outbox"));
    request.onblocked = () => reject(new Error("The outbox is blocked by another tab"));
  }).catch((err) => {
    dbPromise = null; // let the next call try again
    throw err;
  });
  return dbPromise;
}

// Runs `work(store)` in one transaction and resolves with what `work` returns,
// once the transaction has committed.
async function inTransaction(mode, work) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    let result;
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error("Outbox transaction aborted"));
    work(transaction.objectStore(STORE), (value) => {
      result = value;
    });
  });
}

const asPromise = (request, onValue) => {
  request.onsuccess = () => onValue(request.result);
};

// true when this browser can keep an outbox (some private modes cannot).
export async function isStoreAvailable() {
  try {
    await openDb();
    return true;
  } catch {
    return false;
  }
}

export const getAllItems = () => inTransaction("readonly", (store, set) => asPromise(store.getAll(), set));

export const putItem = (item) => inTransaction("readwrite", (store) => void store.put(item));

export const deleteItem = (id) => inTransaction("readwrite", (store) => void store.delete(id));

// Reads one item, lets `change(item)` return its replacement (or null to leave
// it alone), and saves it. All in one transaction. Resolves with the new item,
// or null if the item is gone or `change` declined.
export function updateItem(id, change) {
  return inTransaction("readwrite", (store, set) => {
    asPromise(store.get(id), (current) => {
      if (!current) return set(null);
      const next = change(current);
      if (!next) return set(null);
      store.put(next);
      set(next);
    });
  });
}

// Deletes an item unless a request for it is in flight right now.
export function deleteUnlessSending(id) {
  return inTransaction("readwrite", (store) => {
    asPromise(store.get(id), (current) => {
      if (current && current.status !== "sending") store.delete(id);
    });
  });
}

// Moves a queued item to "sending" and counts the attempt. Resolves with the
// claimed item, or null if it was no longer queued (another tab got there first).
export function claimItem(id, now) {
  return updateItem(id, (item) =>
    item.status === "queued" ? { ...item, status: "sending", attempts: item.attempts + 1, updatedAt: now } : null,
  );
}
