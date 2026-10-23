"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, MapPin, X } from "lucide-react";
import { FormAlert, SelectInput, SubmitButton, TextInput } from "@/components/auth/formUi";
import { createShelter, updateShelter } from "@/lib/api";
import { describeLocationError, getCurrentLocation } from "@/lib/geo";
import {
  MAX_SHELTER_ADDRESS_LENGTH,
  MAX_SHELTER_CAPACITY,
  MAX_SHELTER_NAME_LENGTH,
  PHONE_PATTERN,
  SHELTER_STATUSES,
} from "@/lib/shelterRules";
import { SHELTER_STATUS_META } from "./statusMeta";

const WHOLE = /^\d+$/;
const DECIMAL = /^-?\d+(\.\d+)?$/;
const EMPTY = { name: "", address: "", lat: "", lng: "", capacity: "", occupied: "", status: "open", contactPhone: "" };

// Mirrors the server rules (lib/validation.js).
function validate(values, editing) {
  const errors = {};

  if (!editing) {
    if (!values.name.trim()) errors.name = "Name is required";
    else if (values.name.trim().length > MAX_SHELTER_NAME_LENGTH) errors.name = `Name must be at most ${MAX_SHELTER_NAME_LENGTH} characters`;

    if (!values.address.trim()) errors.address = "Address is required";
    else if (values.address.trim().length > MAX_SHELTER_ADDRESS_LENGTH) errors.address = `Address must be at most ${MAX_SHELTER_ADDRESS_LENGTH} characters`;

    const lat = values.lat.trim();
    const lng = values.lng.trim();
    if (!lat || !lng) errors.location = "Location is required. Use your location or enter both coordinates.";
    else if (!DECIMAL.test(lat) || !DECIMAL.test(lng)) errors.location = "Latitude and longitude must be numbers";
    else if (Math.abs(Number(lat)) > 90) errors.location = "Latitude must be between -90 and 90";
    else if (Math.abs(Number(lng)) > 180) errors.location = "Longitude must be between -180 and 180";

    const phone = values.contactPhone.trim();
    if (phone && !PHONE_PATTERN.test(phone)) errors.contactPhone = "Use 5 to 30 characters: digits, spaces and + - ( ) .";
  }

  const capacity = values.capacity.trim();
  const occupied = values.occupied.trim();
  if (!WHOLE.test(capacity) || Number(capacity) < 1 || Number(capacity) > MAX_SHELTER_CAPACITY) {
    errors.capacity = `Capacity must be a whole number from 1 to ${MAX_SHELTER_CAPACITY.toLocaleString("en-US")}`;
  }
  if (occupied !== "" || editing) {
    if (!WHOLE.test(occupied)) errors.occupied = "Occupied must be a whole number, 0 or more";
    else if (!errors.capacity && Number(occupied) > Number(capacity)) errors.occupied = "Occupied cannot exceed capacity";
  }
  return errors;
}

// Add a shelter (shelter === null) or change an existing one's capacity,
// occupancy and status. Mounted only while open, so every open starts fresh.
export default function ShelterFormModal({ shelter, onClose, onSaved }) {
  const editing = Boolean(shelter);
  const dialogRef = useRef(null);
  const [values, setValues] = useState(
    editing ? { ...EMPTY, capacity: String(shelter.capacity), occupied: String(shelter.occupied), status: shelter.status } : EMPTY,
  );
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

    const found = validate(values, editing);
    setErrors(found);
    setFormError("");
    const first = Object.keys(found)[0];
    if (first) {
      document.getElementById(`shelter-form-${first === "location" ? "lat" : first}`)?.focus();
      return;
    }

    setSubmitting(true);
    const result = editing
      ? await updateShelter(shelter._id, {
          capacity: Number(values.capacity),
          occupied: Number(values.occupied),
          status: values.status,
        })
      : await createShelter({
          name: values.name.trim(),
          address: values.address.trim(),
          location: { lng: Number(values.lng), lat: Number(values.lat) },
          capacity: Number(values.capacity),
          ...(values.occupied.trim() !== "" ? { occupied: Number(values.occupied) } : {}),
          status: values.status,
          ...(values.contactPhone.trim() ? { contactPhone: values.contactPhone.trim() } : {}),
        });
    setSubmitting(false);

    if (result.ok) {
      onSaved(result.shelter, editing ? "updated" : "created");
      return;
    }
    setErrors(result.kind === "validation" ? result.errors : {});
    setFormError(result.message);
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="shelter-form-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current && !submitting) onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-card border border-line-strong bg-surface/95 p-0 text-ink shadow-card-hover backdrop-blur-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="max-h-[85dvh] overflow-y-auto p-6 sm:p-7">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="shelter-form-title" className="font-display text-2xl font-bold tracking-tight">
              {editing ? "Edit shelter" : "Add a shelter"}
            </h2>
            {editing && <p className="mt-1 text-sm text-ink-muted">{shelter.name}</p>}
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

          {!editing && (
            <>
              <TextInput id="shelter-form-name" name="name" label="Name" autoComplete="off" value={values.name} onChange={handleChange} error={errors.name} />
              <TextInput id="shelter-form-address" name="address" label="Address" autoComplete="street-address" value={values.address} onChange={handleChange} error={errors.address} />

              <fieldset className="rounded-2xl border border-line bg-white/5 p-4">
                <legend className="px-1 text-sm font-semibold">Location</legend>
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
                  <TextInput id="shelter-form-lat" name="lat" label="Latitude" inputMode="decimal" autoComplete="off" placeholder="30.65" value={values.lat} onChange={handleChange} />
                  <TextInput id="shelter-form-lng" name="lng" label="Longitude" inputMode="decimal" autoComplete="off" placeholder="76.80" value={values.lng} onChange={handleChange} />
                </div>
                {errors.location && (
                  <p role="alert" className="mt-3 text-sm font-medium text-warn">
                    {errors.location}
                  </p>
                )}
              </fieldset>
            </>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <TextInput id="shelter-form-capacity" name="capacity" label="Capacity" inputMode="numeric" autoComplete="off" value={values.capacity} onChange={handleChange} error={errors.capacity} />
            <TextInput
              id="shelter-form-occupied"
              name="occupied"
              label="Currently occupied"
              optional={!editing}
              inputMode="numeric"
              autoComplete="off"
              placeholder="0"
              value={values.occupied}
              onChange={handleChange}
              error={errors.occupied}
            />
          </div>
          <SelectInput id="shelter-form-status" name="status" label="Status" value={values.status} onChange={handleChange} error={errors.status}>
            {SHELTER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {SHELTER_STATUS_META[status].label}
              </option>
            ))}
          </SelectInput>
          {!editing && (
            <TextInput id="shelter-form-contactPhone" name="contactPhone" type="tel" label="Contact phone" optional autoComplete="off" value={values.contactPhone} onChange={handleChange} error={errors.contactPhone} />
          )}

          <SubmitButton loading={submitting} loadingLabel={editing ? "Saving…" : "Adding…"}>
            {editing ? "Save changes" : "Add shelter"}
          </SubmitButton>
        </form>
      </div>
    </dialog>
  );
}
