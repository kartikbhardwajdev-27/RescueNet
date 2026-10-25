"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, Check, LoaderCircle, MapPin, UserRound, X } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import Card from "@/components/Card";
import { useToast } from "@/components/SosProvider";
import { deviceGeolocation } from "@/lib/devicePosition";
import {
  ORG_TYPES,
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
  isPasswordTooLong,
  isValidEmail,
  normalizeEmail,
} from "@/lib/authRules";
import AuthSkeleton from "./AuthSkeleton";
import { FormAlert, PasswordInput, SelectInput, SubmitButton, TextArea, TextInput } from "./formUi";
import { ORG_TYPE_LABELS, ROLE_LABELS } from "./labels";
import useRedirectWhen from "./useRedirectWhen";

const ROLES = [
  { value: "citizen", icon: UserRound },
  { value: "organization", icon: Building2 },
];

const EMPTY = { name: "", email: "", phone: "", password: "", orgName: "", orgType: "", description: "", contactInfo: "" };

// Error keys match the server's (`org.orgName`, ...) so server errors map onto fields too.
const FIELD_KEYS = {
  name: "name",
  email: "email",
  phone: "phone",
  password: "password",
  orgName: "org.orgName",
  orgType: "org.orgType",
  description: "org.description",
  contactInfo: "org.contactInfo",
};
const fieldId = (key) => `register-${key.replace(".", "-")}`;

// Mirrors the server rules in lib/validation.js (shared constants live in lib/authRules.js).
function validate(values, role) {
  const errors = {};
  if (!values.name.trim()) errors.name = "Name is required";

  if (!values.email.trim()) errors.email = "Email is required";
  else if (!isValidEmail(normalizeEmail(values.email))) errors.email = "Email format is invalid";

  if (!values.phone.trim()) errors.phone = "Phone is required";

  if (!values.password) errors.password = "Password is required";
  else if (values.password.length < PASSWORD_MIN_LENGTH) {
    errors.password = `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  } else if (isPasswordTooLong(values.password)) {
    errors.password = `Password must be at most ${PASSWORD_MAX_BYTES} bytes`;
  }

  if (role === "organization") {
    if (!values.orgName.trim()) errors["org.orgName"] = "Organization name is required for organizations";
    if (!ORG_TYPES.includes(values.orgType)) errors["org.orgType"] = "Organization type is required for organizations";
  }
  return errors;
}

export default function RegisterForm() {
  const { user, register } = useAuth();
  const showToast = useToast();
  const [role, setRole] = useState("citizen");
  const [values, setValues] = useState(EMPTY);
  const [location, setLocation] = useState(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Already logged in (or just registered): go to the account page.
  useRedirectWhen(Boolean(user), "/account");
  if (user) return <AuthSkeleton className="max-w-2xl" />;

  function handleChange(event) {
    const { name, value } = event.target;
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => ({ ...e, [FIELD_KEYS[name]]: undefined }));
  }

  function handleUseLocation() {
    const geolocation = deviceGeolocation();
    if (!geolocation) {
      setLocationError("Your browser doesn't support location. You can still sign up without it.");
      return;
    }
    setLocating(true);
    setLocationError("");
    geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocation({
          type: "Point",
          coordinates: [Number(coords.longitude.toFixed(6)), Number(coords.latitude.toFixed(6))],
        });
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setLocationError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission was denied. You can still sign up without it."
            : "Couldn't get your location. You can still sign up without it.",
        );
      },
      { timeout: 10000, maximumAge: 60000 },
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;

    const found = validate(values, role);
    setErrors(found);
    setFormError("");
    const firstInvalid = Object.keys(found)[0];
    if (firstInvalid) {
      document.getElementById(fieldId(firstInvalid))?.focus();
      return;
    }

    const details = {
      name: values.name.trim(),
      email: values.email.trim(),
      phone: values.phone.trim(),
      password: values.password,
      role,
    };
    if (location) details.location = location;
    if (role === "organization") {
      details.org = {
        orgName: values.orgName.trim(),
        orgType: values.orgType,
        description: values.description.trim() || undefined,
        contactInfo: values.contactInfo.trim() || undefined,
      };
    }

    setSubmitting(true);
    const result = await register(details);
    setSubmitting(false);

    if (result.ok) {
      showToast(`Account created. Welcome, ${result.user.name}!`);
      return;
    }
    if (result.status === 409) {
      setErrors({ email: result.error });
      document.getElementById(fieldId("email"))?.focus();
      return;
    }
    setErrors(result.errors);
    setFormError(result.error);
  }

  const isOrg = role === "organization";

  return (
    <Card lift={false} className="max-w-2xl">
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <FormAlert message={formError} />

        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold text-ink">Account type</legend>
          <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-line-strong bg-white/5 p-1.5">
            {ROLES.map(({ value, icon: Icon }) => (
              <label
                key={value}
                className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-to ${
                  role === value ? "bg-brand-gradient text-on-brand shadow-brand" : "text-ink-muted hover:bg-white/10 hover:text-ink"
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  value={value}
                  checked={role === value}
                  onChange={() => setRole(value)}
                  className="sr-only"
                />
                <Icon className="size-4" aria-hidden="true" />
                {ROLE_LABELS[value]}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-5 sm:grid-cols-2">
          <TextInput
            id={fieldId("name")}
            name="name"
            label="Full name"
            autoComplete="name"
            value={values.name}
            onChange={handleChange}
            error={errors.name}
          />
          <TextInput
            id={fieldId("phone")}
            name="phone"
            type="tel"
            label="Phone"
            autoComplete="tel"
            placeholder="+91 98765 43210"
            value={values.phone}
            onChange={handleChange}
            error={errors.phone}
          />
        </div>
        <TextInput
          id={fieldId("email")}
          name="email"
          type="email"
          label="Email"
          autoComplete="email"
          placeholder="you@example.com"
          value={values.email}
          onChange={handleChange}
          error={errors.email}
        />
        <PasswordInput
          id={fieldId("password")}
          name="password"
          label="Password"
          autoComplete="new-password"
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
          value={values.password}
          onChange={handleChange}
          error={errors.password}
        />

        {isOrg && (
          <div className="flex flex-col gap-5 rounded-2xl border border-line bg-white/5 p-4 sm:p-5">
            <h2 className="font-display text-lg font-bold">Organization details</h2>
            <div className="grid gap-5 sm:grid-cols-2">
              <TextInput
                id={fieldId("org.orgName")}
                name="orgName"
                label="Organization name"
                autoComplete="organization"
                value={values.orgName}
                onChange={handleChange}
                error={errors["org.orgName"]}
              />
              <SelectInput
                id={fieldId("org.orgType")}
                name="orgType"
                label="Organization type"
                value={values.orgType}
                onChange={handleChange}
                error={errors["org.orgType"]}
              >
                <option value="">Select a type…</option>
                {ORG_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {ORG_TYPE_LABELS[type]}
                  </option>
                ))}
              </SelectInput>
            </div>
            <TextArea
              id={fieldId("org.description")}
              name="description"
              label="Description"
              optional
              value={values.description}
              onChange={handleChange}
              error={errors["org.description"]}
            />
            <TextInput
              id={fieldId("org.contactInfo")}
              name="contactInfo"
              label="Contact info"
              optional
              placeholder="Email, phone or website for the public"
              value={values.contactInfo}
              onChange={handleChange}
              error={errors["org.contactInfo"]}
            />
          </div>
        )}

        <div>
          <p className="mb-1.5 flex items-baseline justify-between text-sm font-semibold text-ink">
            Location <span className="text-xs font-medium text-ink-muted">Optional</span>
          </p>
          {location ? (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-info/30 bg-info/10 px-4 py-3 text-sm">
              <Check className="size-5 text-info" aria-hidden="true" />
              <span className="font-medium">
                Location added ({location.coordinates[1]}, {location.coordinates[0]})
              </span>
              <button
                type="button"
                onClick={() => setLocation(null)}
                className="ml-auto flex items-center gap-1 rounded-xl px-2 py-1 font-semibold text-ink-muted transition-colors hover:bg-white/10 hover:text-ink"
              >
                <X className="size-4" aria-hidden="true" />
                Remove
              </button>
            </div>
          ) : (
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
          )}
          {locationError && (
            <p className="mt-1.5 text-sm font-medium text-warn" role="status">
              {locationError}
            </p>
          )}
          {!location && !locationError && (
            <p className="mt-1.5 text-xs text-ink-muted">Helps show incidents and shelters near you.</p>
          )}
        </div>

        <SubmitButton loading={submitting} loadingLabel="Creating account…">
          Create account
        </SubmitButton>
        <p className="text-center text-sm text-ink-muted">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-brand-to underline-offset-4 hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </Card>
  );
}
