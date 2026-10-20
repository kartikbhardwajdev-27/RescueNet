"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import Card from "@/components/Card";
import { useToast } from "@/components/SosProvider";
import { isValidEmail, normalizeEmail } from "@/lib/authRules";
import AuthSkeleton from "./AuthSkeleton";
import { FormAlert, PasswordInput, SubmitButton, TextInput } from "./formUi";
import useRedirectWhen from "./useRedirectWhen";

// Mirrors the server: both fields required, email must look like an email.
function validate({ email, password }) {
  const errors = {};
  if (!email.trim()) errors.email = "Email is required";
  else if (!isValidEmail(normalizeEmail(email))) errors.email = "Email format is invalid";
  if (!password) errors.password = "Password is required";
  return errors;
}

export default function LoginForm() {
  const { user, login } = useAuth();
  const showToast = useToast();
  const [values, setValues] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Already logged in (or just logged in): go to the account page.
  useRedirectWhen(Boolean(user), "/account");
  if (user) return <AuthSkeleton />;

  function handleChange(event) {
    const { name, value } = event.target;
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => ({ ...e, [name]: undefined }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;

    const found = validate(values);
    setErrors(found);
    setFormError("");
    const firstInvalid = Object.keys(found)[0];
    if (firstInvalid) {
      document.getElementById(`login-${firstInvalid}`)?.focus();
      return;
    }

    setSubmitting(true);
    const result = await login(values);
    setSubmitting(false);

    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    showToast(`Welcome back, ${result.user.name}`);
  }

  return (
    <Card lift={false} className="max-w-md">
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <FormAlert message={formError} />
        <TextInput
          id="login-email"
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
          id="login-password"
          name="password"
          label="Password"
          autoComplete="current-password"
          value={values.password}
          onChange={handleChange}
          error={errors.password}
        />
        <SubmitButton loading={submitting} loadingLabel="Logging in…">
          Log in
        </SubmitButton>
        <p className="text-center text-sm text-ink-muted">
          New to RescueNet?{" "}
          <Link href="/register" className="font-semibold text-brand-to underline-offset-4 hover:underline">
            Sign up
          </Link>
        </p>
      </form>
    </Card>
  );
}
