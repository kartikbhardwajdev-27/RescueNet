"use client";

import { useState } from "react";
import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import { Field, SubmitButton, inputClass } from "@/components/auth/formUi";
import { ADDRESS_EXAMPLE, normalizeServerAddress } from "@/lib/serverAddress";

// The "Laptop address" field, a Test button and a Save button. Used by the
// first-run screen and by Settings (Android app only).
//
// Test asks the typed address for /api/health without saving anything, so a
// wrong address can be fixed before it is kept. Saving never requires a passing
// test: the laptop may simply be off right now, and the app is built to be used
// (reports and SOS are queued) when it can't be reached.

// What each answer of the Test button means, in plain words. Amber = a problem,
// blue = information (green is for shelters, red for emergencies only).
const TEST_RESULTS = {
  ok: { tone: "info", text: "Connected. RescueNet answered and its database is ready." },
  db_down: {
    tone: "warn",
    text: "RescueNet answered, but its database isn't running. Reports will be saved on this phone and sent later.",
  },
  not_rescuenet: {
    tone: "warn",
    text: "Something answered, but it doesn't look like RescueNet. Check the address and the port number.",
  },
  unreachable: {
    tone: "warn",
    text: "Couldn't reach it. Is this phone on the same WiFi (or the laptop's hotspot), and is the server running with npm run start:lan?",
  },
};

const secondaryButton =
  "flex w-full items-center justify-center gap-2.5 rounded-2xl border border-line-strong bg-white/5 px-6 py-3.5 font-display text-base font-bold transition-all duration-150 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-70 motion-safe:active:scale-[0.98]";

// onSaved({ url, changed, signedOut }) runs after the address is stored. `children` goes
// under the buttons (the first-run screen puts "Skip for now" there).
export default function ServerAddressForm({ initialValue = "", submitLabel = "Save", onSaved, children }) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState("");
  const [test, setTest] = useState(null); // null | "testing" | one of TEST_RESULTS' keys
  const [saving, setSaving] = useState(false);

  function handleChange(event) {
    setValue(event.target.value);
    setError("");
    setTest(null);
  }

  async function handleTest() {
    const address = normalizeServerAddress(value);
    if (!address.ok) {
      setError(address.error);
      setTest(null);
      return;
    }
    setError("");
    setTest("testing");
    const { testServer } = await import("@/lib/native/http");
    const result = await testServer(address.url);
    setTest(result.state);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (saving) return;
    const address = normalizeServerAddress(value);
    if (!address.ok) {
      setError(address.error);
      document.getElementById("laptop-address")?.focus();
      return;
    }
    setSaving(true);
    const { saveServerUrl } = await import("@/lib/native/storage");
    const outcome = await saveServerUrl(address.url);
    setValue(address.url);
    await onSaved?.({ url: address.url, ...outcome });
    setSaving(false);
  }

  const shown = test && test !== "testing" ? TEST_RESULTS[test] : null;

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <Field
        id="laptop-address"
        label="Laptop address"
        error={error}
        hint={error ? undefined : `Shown on the laptop when the server starts, for example ${ADDRESS_EXAMPLE}`}
      >
        <input
          id="laptop-address"
          name="laptopAddress"
          type="url"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder={ADDRESS_EXAMPLE}
          value={value}
          onChange={handleChange}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "laptop-address-error" : "laptop-address-hint"}
          className={inputClass(Boolean(error))}
        />
      </Field>

      <div aria-live="polite">
        {test === "testing" && (
          <p className="flex items-center gap-2.5 text-sm font-medium text-ink-muted">
            <LoaderCircle className="size-4 shrink-0 motion-safe:animate-spin" aria-hidden="true" />
            Checking the address…
          </p>
        )}
        {shown && (
          <p
            className={`flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-sm font-medium text-ink ${
              shown.tone === "info" ? "border-info/30 bg-info/10" : "border-warn/40 bg-warn/10"
            }`}
          >
            {shown.tone === "info" ? (
              <CircleCheck className="mt-0.5 size-5 shrink-0 text-info" aria-hidden="true" />
            ) : (
              <CircleAlert className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden="true" />
            )}
            {shown.text}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <button type="button" onClick={handleTest} disabled={test === "testing" || saving} className={secondaryButton}>
          Test
        </button>
        <SubmitButton loading={saving} loadingLabel="Saving…">
          {submitLabel}
        </SubmitButton>
        {children}
      </div>
    </form>
  );
}
