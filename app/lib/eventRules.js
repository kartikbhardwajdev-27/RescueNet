// Event rules shared by the model, the server validation and the browser forms.
// Pure and dependency-free (the model itself imports mongoose, which must never
// end up in a browser bundle).

export const EVENT_TYPES = ["volunteer_drive", "donation_camp", "training", "awareness", "other"];
// "upcoming" is every event that has not been cancelled. Whether it is still to
// come, going on or already over is worked out from its times (eventHasEnded).
export const EVENT_STATUSES = ["upcoming", "cancelled"];

export const MAX_EVENT_TITLE_LENGTH = 120;
export const MAX_EVENT_DESCRIPTION_LENGTH = 2000;
export const MAX_EVENT_ADDRESS_LENGTH = 300;
export const MAX_EVENT_CAPACITY = 100_000;

// Sanity limits on the times an organization can enter.
export const EVENT_START_GRACE_MS = 5 * 60_000; // a form left open for a few minutes
export const MAX_EVENT_START_AHEAD_MS = 2 * 365 * 24 * 60 * 60_000; // two years
export const MAX_EVENT_DURATION_MS = 30 * 24 * 60 * 60_000; // thirty days

const toMs = (value) => new Date(value).getTime();

// When an event is over: its end time, or its start time when it has no end.
export const eventEndMs = (event) => toMs(event.endsAt ?? event.startsAt);

export const eventHasEnded = (event, nowMs) => eventEndMs(event) < nowMs;

// Spaces still free, or null when there is no limit.
export const spacesLeft = (capacity, attendeeCount) =>
  capacity == null ? null : Math.max(0, capacity - attendeeCount);
