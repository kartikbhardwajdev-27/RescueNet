// The offline outbox: reports and SOS alerts that are saved on this device
// first, then sent, and sent again later if the server could not be reached.
//
// Why save first: if the connection drops, the page is closed, or the phone
// dies mid-request, the report is still in IndexedDB and goes out next time.
//
// Why nothing is sent twice:
//   1. each item's id is sent as an Idempotency-Key, and the server answers a
//      repeat with the first result (lib/idempotency.js, the real guarantee);
//   2. "claiming" an item (queued -> sending) is one IndexedDB transaction, so
//      two open tabs cannot both send the same item (lib/outboxStore.js);
//   3. items are only sent from `queued`, never from `sending`.
//
// This module is plain JavaScript with no React. Components read it through
// components/useOutbox.js and start it with <OutboxRunner />.

import { createIncident, sendSos } from "@/lib/api";
import {
  byNewest,
  isExpiredSent,
  isRetryable,
  isStaleSending,
  newClientId,
  pickNext,
  retryDelayMs,
} from "@/lib/outboxRules";
import { claimItem, deleteItem, deleteUnlessSending, getAllItems, isStoreAvailable, putItem, updateItem } from "@/lib/outboxStore";

// ---- state other code can read ----
//
//   items         every item, newest first
//   available     can this browser keep an outbox at all (null until known)
//   ready         the saved items have been read
//   serverState   "unknown" | "online" | "degraded" (server up, database down) | "offline"
//   browserOnline what the browser reports (false = no network at all). Not the
//                 same as the server being unreachable: with WiFi off the
//                 server on this laptop can still be perfectly reachable.

const SERVER_SNAPSHOT = Object.freeze({ items: [], available: null, ready: false, serverState: "unknown", browserOnline: true });

let snapshot = { ...SERVER_SNAPSHOT, items: [] };
const listeners = new Set();
const eventListeners = new Set();

function publish(changes) {
  snapshot = { ...snapshot, ...changes };
  for (const listener of listeners) listener();
}

export const subscribeOutbox = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const getOutboxSnapshot = () => snapshot;
export const getServerOutboxSnapshot = () => SERVER_SNAPSHOT;

// Events for items that finished while nobody was watching them:
//   { type: "sent", item }    a queued item went through
//   { type: "failed", item }  the server refused a queued item for good
export function onOutboxEvent(listener) {
  eventListeners.add(listener);
  return () => eventListeners.delete(listener);
}
const emit = (event) => {
  for (const listener of eventListeners) listener(event);
};

// ---- talking to the server ----

// The time the person submitted it travels with every send (and every retry), so
// a report that waited in the queue is still dated when it was made.
const sendOptions = (item, timeoutMs) => ({
  idempotencyKey: item.id,
  timeoutMs,
  capturedAt: new Date(item.createdAt).toISOString(),
});

const SEND = {
  sos: (item, options) => sendSos(item.payload.location, options),
  report: (item, options) => createIncident(item.payload, options),
};

const serverIdOf = (kind, result) => (kind === "sos" ? result.id : result.incident?._id);

// A person is waiting on this one, so give up sooner than for a background retry.
const INTERACTIVE_TIMEOUT_MS = 8000;
const BACKGROUND_TIMEOUT_MS = 15_000;
const HEALTH_TIMEOUT_MS = 6000;

function setServerState(next) {
  if (snapshot.serverState === next) return;
  const wasReachable = snapshot.serverState === "online" || snapshot.serverState === "degraded";
  publish({ serverState: next });
  // The server just came back: send what is waiting now, not after the next timer.
  if (next === "online" && !wasReachable) releaseNetworkBackoff().then(flush);
}

// Items that were waiting only because the server could not be reached are due
// again the moment it can. Without this, an SOS that had been retried during the
// outage could still be sitting in its own wait while a newer report, never yet
// retried, goes out first.
async function releaseNetworkBackoff() {
  try {
    for (const item of await getAllItems()) {
      if (item.status === "queued" && item.retryReason === "network" && item.nextAttemptAt > 0) {
        await updateItem(item.id, (current) =>
          current.status === "queued" && current.retryReason === "network" ? { ...current, nextAttemptAt: 0 } : null,
        );
      }
    }
    await changed();
  } catch {
    // Storage trouble: the normal timer still sends them.
  }
}

async function checkServer() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch("/api/health", { cache: "no-store", signal: controller.signal });
    const body = await res.json().catch(() => null);
    setServerState(res.ok && body?.db === "connected" ? "online" : "degraded");
  } catch {
    setServerState("offline");
  } finally {
    clearTimeout(timer);
  }
}

// ---- keeping the list in step with storage (and with other tabs) ----

let channel = null;

async function refreshItems() {
  try {
    publish({ items: (await getAllItems()).sort(byNewest) });
  } catch {
    // Storage went away; keep showing what we have.
  }
}

// After changing storage: update this tab and tell the others.
async function changed() {
  await refreshItems();
  channel?.postMessage("changed");
}

// ---- one attempt to send an item ----
//
// `item` must already be claimed (status "sending"). Resolves with what the
// caller needs to show:
//   { status: "sent", item, id }
//   { status: "queued", item, kind, message }   try again later
//   { status: "failed", item, kind, message, errors }   will never work
// For an interactive attempt a "failed" item is removed (the person sees the
// error right there and fixes it); in the background it stays, marked failed.
async function runAttempt(item, { interactive }) {
  const result = await SEND[item.kind](item, sendOptions(item, interactive ? INTERACTIVE_TIMEOUT_MS : BACKGROUND_TIMEOUT_MS));
  const now = Date.now();

  if (result.ok) {
    setServerState("online");
    const sent = await updateItem(item.id, (current) => ({
      ...current,
      status: "sent",
      sentAt: now,
      updatedAt: now,
      lastError: null,
      result: { id: String(serverIdOf(item.kind, result)) },
    }));
    await changed();
    const final = sent ?? item;
    if (!interactive) emit({ type: "sent", item: final });
    return { status: "sent", item: final, id: serverIdOf(item.kind, result) };
  }

  if (isRetryable(result)) {
    if (result.kind === "network") setServerState("offline");
    // An unreachable server is polled steadily (and released the moment the
    // health check sees it again), so it does not need a growing wait.
    const attempts = result.kind === "network" ? 1 : item.attempts;
    const delay = retryDelayMs({ attempts, kind: item.kind, retryAfterSeconds: result.retryAfter });
    const queued = await updateItem(item.id, (current) => ({
      ...current,
      status: "queued",
      updatedAt: now,
      nextAttemptAt: now + delay,
      lastError: result.message,
      retryReason: result.kind,
    }));
    await changed();
    return { status: "queued", item: queued ?? item, kind: result.kind, message: result.message };
  }

  if (interactive) {
    await deleteItem(item.id).catch(() => {});
    await changed();
    return { status: "failed", item, kind: result.kind, message: result.message, errors: result.errors };
  }
  const failed = await updateItem(item.id, (current) => ({ ...current, status: "failed", updatedAt: now, lastError: result.message }));
  await changed();
  emit({ type: "failed", item: failed ?? item });
  return { status: "failed", item: failed ?? item, kind: result.kind, message: result.message, errors: result.errors };
}

// ---- sending what is waiting ----

let flushing = false;
let flushAgain = false;

async function drain() {
  const blockedKinds = new Set();
  for (;;) {
    const next = pickNext(await getAllItems(), Date.now(), blockedKinds);
    if (!next) return;
    const claimed = await claimItem(next.id, Date.now());
    if (!claimed) continue; // another tab took it
    await refreshItems();
    const outcome = await runAttempt(claimed, { interactive: false });
    if (outcome.status === "queued") {
      // The server cannot be reached: the rest would fail the same way. Anything
      // else (a rate limit on one kind) only holds back that kind.
      if (outcome.kind === "network") return;
      blockedKinds.add(claimed.kind);
    }
  }
}

// Housekeeping before each pass: rescue items whose tab disappeared mid-send,
// and drop confirmed items after a day.
async function tidy() {
  const now = Date.now();
  for (const item of await getAllItems()) {
    if (isStaleSending(item, now)) {
      await updateItem(item.id, (current) =>
        isStaleSending(current, now) ? { ...current, status: "queued", nextAttemptAt: 0, updatedAt: now } : null,
      );
    } else if (isExpiredSent(item, now)) {
      await deleteItem(item.id);
    }
  }
}

// Sends every due item, SOS first. Safe to call from anywhere, any time: calls
// that arrive while a pass is running just ask for one more pass afterwards.
export async function flushOutbox() {
  if (flushing) {
    flushAgain = true;
    return;
  }
  flushing = true;
  try {
    do {
      flushAgain = false;
      if (!(await isStoreAvailable())) return;
      await tidy();
      await drain();
    } while (flushAgain);
  } catch {
    // Storage trouble: the next tick tries again.
  } finally {
    flushing = false;
    await refreshItems();
  }
}
const flush = flushOutbox;

// ---- what the screens call ----

// Saves a report or SOS, then tries to send it right away.
//   kind     "sos" | "report"
//   payload  what lib/api.js sends: { location } for an SOS, the report fields otherwise
// Resolves with the same shapes as runAttempt, plus { status: "failed", unsaved: true }
// when this browser cannot keep an outbox and the send did not work.
export async function submitToOutbox({ kind, payload }) {
  const now = Date.now();
  const offlineNow = snapshot.serverState === "offline";
  const item = {
    id: newClientId(),
    kind,
    payload,
    // Saved already "sending" (the first attempt counted), so the background
    // sender, which only takes "queued" items, can never pick it up in the gap
    // between saving it and sending it. Known-unreachable: save it "queued".
    status: offlineNow ? "queued" : "sending",
    createdAt: now,
    updatedAt: now,
    attempts: offlineNow ? 0 : 1,
    nextAttemptAt: 0,
    lastError: offlineNow ? "Couldn't reach the server" : null,
    retryReason: offlineNow ? "network" : undefined,
    result: null,
  };

  if (!(await isStoreAvailable())) {
    // No place to keep it, so behave as before the outbox existed: send once.
    const result = await SEND[kind](item, sendOptions(item, INTERACTIVE_TIMEOUT_MS));
    if (result.ok) return { status: "sent", item, id: serverIdOf(kind, result) };
    return { status: "failed", item, kind: result.kind, message: result.message, errors: result.errors, unsaved: true };
  }

  await putItem(item);
  await changed();

  if (offlineNow) {
    // Known to be unreachable: keep it, and do not make the person wait for a timeout.
    checkServer(); // if it is back after all, this sends it
    return { status: "queued", item, kind: "network", message: "Couldn't reach the server" };
  }
  return runAttempt(item, { interactive: true });
}

// "Send now" / "Try again" on an item in the list.
export async function retryItem(id) {
  const now = Date.now();
  await updateItem(id, (item) =>
    item.status === "failed" || item.status === "queued"
      ? { ...item, status: "queued", nextAttemptAt: 0, updatedAt: now, ...(item.status === "failed" ? { attempts: 0, lastError: null } : {}) }
      : null,
  );
  await changed();
  flush();
}

// Removes an item from the list (not one that is being sent right now).
export async function removeItem(id) {
  await deleteUnlessSending(id);
  await changed();
}

// ---- starting and stopping ----

let users = 0;
let stopEngine = null;

function boot() {
  let stopped = false;
  publish({ browserOnline: navigator.onLine !== false });

  if (typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel("rescuenet-outbox");
    channel.onmessage = () => {
      if (!stopped) refreshItems();
    };
  }

  isStoreAvailable().then(async (available) => {
    if (stopped) return;
    publish({ available });
    if (available) await refreshItems();
    publish({ ready: true });
    flush();
  });
  checkServer();

  const handleOnline = () => {
    publish({ browserOnline: true });
    checkServer();
  };
  const handleOffline = () => {
    publish({ browserOnline: false });
    checkServer();
  };
  const handleVisible = () => {
    if (document.visibilityState !== "visible") return;
    checkServer();
    flush();
  };
  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);
  document.addEventListener("visibilitychange", handleVisible);

  // Is the server reachable? Quick when something is wrong, relaxed otherwise.
  let heartbeat;
  const beat = async () => {
    if (document.visibilityState === "visible") await checkServer();
    if (!stopped) heartbeat = setTimeout(beat, snapshot.serverState === "online" ? 8000 : 3000);
  };
  heartbeat = setTimeout(beat, 3000);

  // Retry timer. Runs even in a background tab so an SOS is not held up until
  // someone looks at the screen again.
  const ticker = setInterval(() => {
    if (snapshot.items.some((item) => item.status === "queued" || item.status === "sending")) flush();
  }, 4000);

  return () => {
    stopped = true;
    clearTimeout(heartbeat);
    clearInterval(ticker);
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
    document.removeEventListener("visibilitychange", handleVisible);
    channel?.close();
    channel = null;
  };
}

// Starts the engine (once, however many callers). Returns a function that stops it.
export function startOutbox() {
  users += 1;
  if (users === 1) stopEngine = boot();
  return () => {
    users -= 1;
    if (users === 0) {
      stopEngine?.();
      stopEngine = null;
    }
  };
}

