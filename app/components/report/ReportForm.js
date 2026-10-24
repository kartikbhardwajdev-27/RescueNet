"use client";

import { useState } from "react";
import { CircleHelp, LoaderCircle, MapPin } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { FormAlert, Field, SubmitButton, TextInput, inputClass } from "@/components/auth/formUi";
import Card from "@/components/Card";
import { INCIDENT_TYPE_META } from "@/components/incidentMeta";
import { useToast } from "@/components/SosProvider";
import { incidentReference } from "@/lib/api";
import { describeLocationError, getCurrentLocation } from "@/lib/geo";
import { INCIDENT_SEVERITIES, INCIDENT_TYPES, MAX_DESCRIPTION_LENGTH } from "@/lib/incidentRules";
import { submitToOutbox } from "@/lib/outbox";
import ReportConfirmation from "./ReportConfirmation";
import SuggestedPriority from "./SuggestedPriority";

const SEVERITY_HELP = {
  low: "Minor. Nobody is in immediate danger.",
  medium: "Needs attention soon.",
  high: "Serious. People may be at risk.",
  critical: "Life-threatening. Help is needed now.",
};

const EMPTY = { type: "", severity: "medium", description: "", lat: "", lng: "", address: "" };

// Error keys match the server's (`type`, `description`, `location`, ...) plus
// `lat` / `lng` for problems found while checking the coordinate inputs.
const FOCUS_ORDER = ["type", "description", "lat", "lng", "location", "address"];
const FOCUS_IDS = {
  type: "report-type",
  description: "report-description",
  lat: "report-lat",
  lng: "report-lng",
  location: "report-lat",
  address: "report-address",
};

const DECIMAL = /^-?\d+(\.\d+)?$/;

// Mirrors the server rules (lib/validation.js).
function validate(values) {
  const errors = {};
  if (!INCIDENT_TYPES.includes(values.type)) errors.type = "Choose what is happening";
  if (!values.description.trim()) errors.description = "Description is required";

  const lat = values.lat.trim();
  const lng = values.lng.trim();
  if (!lat && !lng) {
    errors.location = "Location is required. Use your location or enter the coordinates.";
  } else {
    if (!lat) errors.lat = "Latitude is required";
    else if (!DECIMAL.test(lat)) errors.lat = "Latitude must be a number";
    else if (Math.abs(Number(lat)) > 90) errors.lat = "Latitude must be between -90 and 90";

    if (!lng) errors.lng = "Longitude is required";
    else if (!DECIMAL.test(lng)) errors.lng = "Longitude must be a number";
    else if (Math.abs(Number(lng)) > 180) errors.lng = "Longitude must be between -180 and 180";
  }
  return errors;
}

const chipBase =
  "flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl p-3 text-sm font-bold transition-all duration-150 last:col-span-2 sm:last:col-span-1 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-to motion-safe:active:scale-95";
const chipOn = "bg-brand-gradient text-on-brand shadow-brand";
const chipOff = "border border-line-strong bg-white/5 text-ink-muted hover:bg-white/10 hover:text-ink";

export default function ReportForm() {
  const { user } = useAuth();
  const showToast = useToast();
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);
  // { kind: "ok" | "error", text } about the last "Use my location" attempt.
  const [locationNote, setLocationNote] = useState(null);
  // The outbox item of a report that was saved but not delivered yet.
  const [queuedId, setQueuedId] = useState(null);

  function setField(name, value) {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => {
      const next = { ...e, [name]: undefined };
      // Coordinate edits also clear the shared location error.
      if (name === "lat" || name === "lng") next.location = undefined;
      return next;
    });
  }

  const handleChange = (event) => setField(event.target.name, event.target.value);

  async function handleUseLocation() {
    setLocating(true);
    setLocationNote(null);
    try {
      const { lat, lng, accuracy } = await getCurrentLocation();
      setValues((v) => ({ ...v, lat: String(lat), lng: String(lng) }));
      setErrors((e) => ({ ...e, lat: undefined, lng: undefined, location: undefined }));
      setLocationNote({ kind: "ok", text: `Location filled from your device (accurate to about ${Math.round(accuracy)} m).` });
    } catch (err) {
      setLocationNote({ kind: "error", text: `${describeLocationError(err.code)} You can enter the coordinates below instead.` });
    }
    setLocating(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;

    const found = validate(values);
    setErrors(found);
    setFormError("");
    const firstInvalid = FOCUS_ORDER.find((key) => found[key]);
    if (firstInvalid) {
      document.getElementById(FOCUS_IDS[firstInvalid])?.focus();
      return;
    }

    const payload = {
      type: values.type,
      severity: values.severity,
      description: values.description.trim(),
      location: { lng: Number(values.lng), lat: Number(values.lat) },
    };
    if (values.address.trim()) payload.address = values.address.trim();

    // Saved on this device first, then sent. If the server cannot be reached it
    // stays saved and is sent when it can (lib/outbox.js).
    setSubmitting(true);
    const result = await submitToOutbox({ kind: "report", payload });
    setSubmitting(false);

    if (result.status === "sent" || result.status === "queued") {
      if (result.status === "sent") {
        setQueuedId(null);
        showToast(`Report submitted. Reference: ${incidentReference(result.id)}`);
      } else {
        // The confirmation panel above the form carries the "Queued" badge.
        setQueuedId(result.item.id);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      setValues(EMPTY);
      setErrors({});
      setLocationNote(null);
      return;
    }

    // Anything went wrong: keep what the person typed so they can fix and resend.
    setErrors(result.kind === "validation" ? result.errors : {});
    setFormError(result.message);
    document.getElementById("report-form-alert")?.scrollIntoView({ block: "center" });
  }

  const locationError = errors.location;

  return (
    <>
      {queuedId && <ReportConfirmation itemId={queuedId} onDismiss={() => setQueuedId(null)} />}
      <Card lift={false} className="max-w-3xl">
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-7">
          <div id="report-form-alert">
            <FormAlert message={formError} />
          </div>

          <fieldset>
            <legend className="mb-2.5 font-display text-lg font-bold">What is happening?</legend>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {INCIDENT_TYPES.map((type, index) => {
                const { label, icon: Icon } = INCIDENT_TYPE_META[type] ?? { label: type, icon: CircleHelp };
                const selected = values.type === type;
                return (
                  <label key={type} className={`${chipBase} ${selected ? chipOn : chipOff}`}>
                    <input
                      id={index === 0 ? "report-type" : undefined}
                      type="radio"
                      name="type"
                      value={type}
                      checked={selected}
                      onChange={handleChange}
                      aria-describedby={errors.type ? "report-type-error" : undefined}
                      className="sr-only"
                    />
                    <Icon className="size-7" aria-hidden="true" />
                    {label}
                  </label>
                );
              })}
            </div>
            {errors.type && (
              <p id="report-type-error" className="mt-2 text-sm font-medium text-warn">
                {errors.type}
              </p>
            )}
          </fieldset>

          <fieldset>
            <legend className="mb-2.5 font-display text-lg font-bold">How serious is it?</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {INCIDENT_SEVERITIES.map((severity) => {
                const selected = values.severity === severity;
                return (
                  <label
                    key={severity}
                    className={`flex cursor-pointer items-center justify-center rounded-2xl px-4 py-3 text-sm font-bold capitalize transition-all duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-to motion-safe:active:scale-95 ${selected ? chipOn : chipOff}`}
                  >
                    <input type="radio" name="severity" value={severity} checked={selected} onChange={handleChange} className="sr-only" />
                    {severity}
                  </label>
                );
              })}
            </div>
            <p className="mt-2 text-sm text-ink-muted">{SEVERITY_HELP[values.severity]}</p>
            {errors.severity && <p className="mt-2 text-sm font-medium text-warn">{errors.severity}</p>}
          </fieldset>

          <Field id="report-description" label="Describe what you see" error={errors.description}>
            <textarea
              id="report-description"
              name="description"
              rows={5}
              maxLength={MAX_DESCRIPTION_LENGTH}
              value={values.description}
              onChange={handleChange}
              placeholder="What happened, how many people are affected, anything responders should know."
              aria-invalid={errors.description ? true : undefined}
              aria-describedby={errors.description ? "report-description-error report-description-count" : "report-description-count"}
              className={inputClass(Boolean(errors.description), "resize-y")}
            />
            <p
              id="report-description-count"
              className={`mt-1.5 text-right text-xs ${values.description.length >= MAX_DESCRIPTION_LENGTH * 0.9 ? "font-semibold text-warn" : "text-ink-muted"}`}
            >
              {values.description.length} / {MAX_DESCRIPTION_LENGTH}
            </p>
            <SuggestedPriority
              description={values.description}
              severity={values.severity}
              onApply={(severity) => setField("severity", severity)}
            />
          </Field>

          <fieldset className="rounded-2xl border border-line bg-white/5 p-4 sm:p-5">
            <legend className="px-1 font-display text-lg font-bold">Where is it?</legend>
            <button
              type="button"
              onClick={handleUseLocation}
              disabled={locating}
              className="flex items-center gap-2 rounded-2xl border border-line-strong bg-white/5 px-4 py-2.5 text-sm font-semibold transition-all duration-150 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-70 motion-safe:active:scale-95"
            >
              {locating ? (
                <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden="true" />
              ) : (
                <MapPin className="size-4" aria-hidden="true" />
              )}
              {locating ? "Locating…" : "Use my location"}
            </button>
            {locationNote && (
              <p
                role="status"
                className={`mt-2 text-sm ${locationNote.kind === "ok" ? "text-info" : "font-medium text-warn"}`}
              >
                {locationNote.text}
              </p>
            )}

            <p className="mt-5 mb-3 text-xs font-semibold tracking-wide text-ink-muted uppercase">Or enter coordinates</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextInput
                id="report-lat"
                name="lat"
                label="Latitude"
                inputMode="decimal"
                autoComplete="off"
                placeholder="28.6139"
                value={values.lat}
                onChange={handleChange}
                error={errors.lat}
              />
              <TextInput
                id="report-lng"
                name="lng"
                label="Longitude"
                inputMode="decimal"
                autoComplete="off"
                placeholder="77.2090"
                value={values.lng}
                onChange={handleChange}
                error={errors.lng}
              />
            </div>
            {locationError && (
              <p className="mt-3 text-sm font-medium text-warn" role="alert">
                {locationError}
              </p>
            )}
          </fieldset>

          <TextInput
            id="report-address"
            name="address"
            label="Address or landmark"
            optional
            autoComplete="street-address"
            placeholder="Street, area, nearby landmark"
            value={values.address}
            onChange={handleChange}
            error={errors.address}
          />

          <div className="flex flex-col gap-3">
            <SubmitButton loading={submitting} loadingLabel="Submitting…">
              Submit report
            </SubmitButton>
            <p className="text-center text-xs text-ink-muted">
              {user ? `Reporting as ${user.name}.` : "You can report without an account."} In immediate danger? Use the
              SOS button.
            </p>
          </div>
        </form>
      </Card>
    </>
  );
}
