"use client";

import { useState } from "react";
import { CircleAlert, Eye, EyeOff, LoaderCircle } from "lucide-react";

// Validation and server errors are amber (warning), never red: red is reserved
// for SOS / emergencies.

const baseInput =
  "w-full rounded-2xl border bg-white/5 px-4 py-3 text-ink placeholder:text-ink-muted/70 transition-colors duration-150";

export function inputClass(invalid, extra = "") {
  const state = invalid ? "border-warn" : "border-line-strong hover:border-white/25 focus:border-brand-to";
  return `${baseInput} ${state} ${extra}`;
}

function describedBy(id, error, hint) {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

export function Field({ id, label, error, hint, optional, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between text-sm font-semibold text-ink">
        {label}
        {optional && <span className="text-xs font-medium text-ink-muted">Optional</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 flex items-start gap-1.5 text-sm font-medium text-warn">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="mt-1.5 text-xs text-ink-muted">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export function TextInput({ id, label, error, hint, optional, ...props }) {
  return (
    <Field id={id} label={label} error={error} hint={hint} optional={optional}>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={inputClass(Boolean(error))}
        {...props}
      />
    </Field>
  );
}

export function PasswordInput({ id, label, error, hint, ...props }) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;
  return (
    <Field id={id} label={label} error={error} hint={hint}>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, error, hint)}
          className={inputClass(Boolean(error), "pr-12")}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-1.5 my-auto flex size-9 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-white/10 hover:text-ink"
        >
          <Icon className="size-5" aria-hidden="true" />
        </button>
      </div>
    </Field>
  );
}

export function SelectInput({ id, label, error, hint, children, ...props }) {
  return (
    <Field id={id} label={label} error={error} hint={hint}>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={inputClass(Boolean(error))}
        {...props}
      >
        {children}
      </select>
    </Field>
  );
}

export function TextArea({ id, label, error, hint, optional, ...props }) {
  return (
    <Field id={id} label={label} error={error} hint={hint} optional={optional}>
      <textarea
        id={id}
        rows={3}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={inputClass(Boolean(error), "resize-y")}
        {...props}
      />
    </Field>
  );
}

// Form-level message (server errors, or "fix the highlighted fields").
export function FormAlert({ message }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-2.5 rounded-2xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm font-medium text-ink"
    >
      <CircleAlert className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden="true" />
      {message}
    </p>
  );
}

export function SubmitButton({ loading, loadingLabel, children }) {
  return (
    <button
      type="submit"
      disabled={loading}
      aria-busy={loading}
      className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-brand-gradient px-6 py-3.5 font-display text-base font-bold text-on-brand shadow-brand transition-all duration-150 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:brightness-100 motion-safe:active:scale-[0.98]"
    >
      {loading && <LoaderCircle className="size-5 motion-safe:animate-spin" aria-hidden="true" />}
      {loading ? loadingLabel : children}
    </button>
  );
}
