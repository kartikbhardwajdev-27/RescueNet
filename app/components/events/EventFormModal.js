"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, MapPin, X } from "lucide-react";
import { FormAlert, SelectInput, SubmitButton, TextArea, TextInput } from "@/components/auth/formUi";
import { createEvent } from "@/lib/api";
import {
  EVENT_START_GRACE_MS,
  EVENT_TYPES,
  MAX_EVENT_ADDRESS_LENGTH,
  MAX_EVENT_CAPACITY,
  MAX_EVENT_DESCRIPTION_LENGTH,
  MAX_EVENT_DURATION_MS,
  MAX_EVENT_START_AHEAD_MS,
  MAX_EVENT_TITLE_LENGTH,
} from "@/lib/eventRules";
import { describeLocationError, getCurrentLocation } from "@/lib/geo";
import { eventTypeMeta } from "./eventMeta";

const WHOLE = /^\d+$/;
const DECIMAL = /^-?\d+(\.\d+)?$/;

// Mirrors the server rules (lib/validation.js). `nowMs` is read when the form is
// submitted, not while it renders.
function validate(values, nowMs) {
  const errors = {};

  if (!values.title.trim()) errors.title = "Title is required";
  else if (values.title.trim().length > MAX_EVENT_TITLE_LENGTH) errors.title = `Title must be at most ${MAX_EVENT_TITLE_LENGTH} characters`;

  if (!values.description.trim()) errors.description = "Description is required";
  else if (values.description.trim().length > MAX_EVENT_DESCRIPTION_LENGTH) {
    errors.description = `Description must be at most ${MAX_EVENT_DESCRIPTION_LENGTH} characters`;
  }

  if (!EVENT_TYPES.includes(values.type)) errors.type = "Choose a type";

  if (!values.address.trim()) errors.address = "Address is required";
  else if (values.address.trim().length > MAX_EVENT_ADDRESS_LENGTH) errors.address = `Address must be at most ${MAX_EVENT_ADDRESS_LENGTH} characters`;

  const lat = values.lat.trim();
  const lng = values.lng.trim();
  if (!lat || !lng) errors.location = "Location is required. Use your location or enter both coordinates.";
  else if (!DECIMAL.test(lat) || !DECIMAL.test(lng)) errors.location = "Latitude and longitude must be numbers";
  else if (Math.abs(Number(lat)) > 90) errors.location = "Latitude must be between -90 and 90";
  else if (Math.abs(Number(lng)) > 180) errors.location = "Longitude must be between -180 and 180";

  const start = values.startsAt ? new Date(values.startsAt).getTime() : NaN;
  if (!values.startsAt || Number.isNaN(start)) errors.startsAt = "Choose when it starts";
  else if (start < nowMs - EVENT_START_GRACE_MS) errors.startsAt = "The start time can't be in the past";
  else if (start > nowMs + MAX_EVENT_START_AHEAD_MS) errors.startsAt = "The start time can't be more than 2 years ahead";

  if (values.endsAt) {
    const end = new Date(values.endsAt).getTime();
    if (Number.isNaN(end)) errors.endsAt = "Choose a valid end time";
    else if (!errors.startsAt && end <= start) errors.endsAt = "The end time must be after the start time";
    else if (!errors.startsAt && end - start > MAX_EVENT_DURATION_MS) errors.endsAt = "An event can last at most 30 days";
  }

  const capacity = values.capacity.trim();
  if (capacity && (!WHOLE.test(capacity) || Number(capacity) < 1 || Number(capacity) > MAX_EVENT_CAPACITY)) {
    errors.capacity = `Capacity must be a whole number from 1 to ${MAX_EVENT_CAPACITY.toLocaleString("en-US")}`;
  }
  return errors;
}

// Post a new event (organizations only; the server checks). `defaults.startsAt`
// is a datetime-local value for the suggested start. Mounted only while open, so
// every open starts fresh.
export default function EventFormModal({ defaults, onClose, onSaved }) {
  const dialogRef = useRef(null);
  const [values, setValues] = useState({
    title: "",
    type: "volunteer_drive",
    description: "",
    startsAt: defaults.startsAt,
    endsAt: "",
    address: "",
    lat: "",
    lng: "",
    capacity: "",
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState("");

  // Native <dialog> gives us the focus trap, Esc handling and inert background.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  function handleChange(event) {
    const { name, value } = event.target;
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => ({ ...e, [name]: undefined, ...(name === "lat" || name === "lng" ? { location: undefined } : {}) }));
  }

  async function handleUseLocation() {
    setLocating(true);
    setLocationNote("");
    try {
      const { lat, lng } = await getCurrentLocation();
      setValues((v) => ({ ...v, lat: String(lat), lng: String(lng) }));
      setErrors((e) => ({ ...e, location: undefined }));
    } catch (err) {
      setLocationNote(`${describeLocationError(err.code)} You can enter the coordinates instead.`);
    }
    setLocating(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;

    const found = validate(values, Date.now());
    setErrors(found);
    setFormError("");
    const first = Object.keys(found)[0];
    if (first) {
      document.getElementById(`event-form-${first === "location" ? "lat" : first}`)?.focus();
      return;
    }

    setSubmitting(true);
    const result = await createEvent({
      title: values.title.trim(),
      description: values.description.trim(),
      type: values.type,
      address: values.address.trim(),
      location: { lng: Number(values.lng), lat: Number(values.lat) },
      // the form's local time -> an exact moment (ISO 8601 with its time zone)
      startsAt: new Date(values.startsAt).toISOString(),
      ...(values.endsAt ? { endsAt: new Date(values.endsAt).toISOString() } : {}),
      ...(values.capacity.trim() ? { capacity: Number(values.capacity) } : {}),
    });
    setSubmitting(false);

    if (result.ok) {
      onSaved(result.event);
      return;
    }
    setErrors(result.kind === "validation" ? result.errors : {});
    setFormError(result.message);
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="event-form-heading"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current && !submitting) onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-card border border-line-strong bg-surface/95 p-0 text-ink shadow-card-hover backdrop-blur-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="max-h-[85dvh] overflow-y-auto p-6 sm:p-7">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="event-form-heading" className="font-display text-2xl font-bold tracking-tight">
              Create an event
            </h2>
            <p className="mt-1 text-sm text-ink-muted">A volunteer drive, donation camp, training or awareness event.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mt-1 -mr-1 flex size-10 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-white/10 hover:text-ink"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
          <FormAlert message={formError} />

          <TextInput id="event-form-title" name="title" label="Title" autoComplete="off" maxLength={MAX_EVENT_TITLE_LENGTH} value={values.title} onChange={handleChange} error={errors.title} />
          <SelectInput id="event-form-type" name="type" label="Type" value={values.type} onChange={handleChange} error={errors.type}>
            {EVENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {eventTypeMeta(type).label}
              </option>
            ))}
          </SelectInput>
          <TextArea id="event-form-description" name="description" label="Description" placeholder="What will happen, what to bring, who it is for." value={values.description} onChange={handleChange} error={errors.description} />

          <div className="grid gap-5 sm:grid-cols-2">
            <TextInput id="event-form-startsAt" name="startsAt" type="datetime-local" label="Starts" value={values.startsAt} onChange={handleChange} error={errors.startsAt} />
            <TextInput id="event-form-endsAt" name="endsAt" type="datetime-local" label="Ends" optional value={values.endsAt} onChange={handleChange} error={errors.endsAt} />
          </div>

          <TextInput id="event-form-address" name="address" label="Address" autoComplete="street-address" placeholder="Where to go" value={values.address} onChange={handleChange} error={errors.address} />

          <fieldset className="rounded-2xl border border-line bg-white/5 p-4">
            <legend className="px-1 text-sm font-semibold">Location on the map</legend>
            <button
              type="button"
              onClick={handleUseLocation}
              disabled={locating}
              className="flex items-center gap-2 rounded-xl border border-line-strong bg-white/5 px-3.5 py-2 text-sm font-semibold transition-all duration-150 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-70 motion-safe:active:scale-95"
            >
              {locating ? <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden="true" /> : <MapPin className="size-4" aria-hidden="true" />}
              {locating ? "Locating…" : "Use my location"}
            </button>
            {locationNote && (
              <p role="status" className="mt-2 text-sm font-medium text-warn">
                {locationNote}
              </p>
            )}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <TextInput id="event-form-lat" name="lat" label="Latitude" inputMode="decimal" autoComplete="off" placeholder="30.65" value={values.lat} onChange={handleChange} />
              <TextInput id="event-form-lng" name="lng" label="Longitude" inputMode="decimal" autoComplete="off" placeholder="76.80" value={values.lng} onChange={handleChange} />
            </div>
            {errors.location && (
              <p role="alert" className="mt-3 text-sm font-medium text-warn">
                {errors.location}
              </p>
            )}
          </fieldset>

          <TextInput
            id="event-form-capacity"
            name="capacity"
            label="Space for how many people?"
            optional
            inputMode="numeric"
            autoComplete="off"
            placeholder="No limit"
            value={values.capacity}
            onChange={handleChange}
            error={errors.capacity}
          />

          <SubmitButton loading={submitting} loadingLabel="Creating…">
            Create event
          </SubmitButton>
        </form>
      </div>
    </dialog>
  );
}
