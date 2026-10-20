"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

const NETWORK_ERROR = "Couldn't reach the server. Check your connection and try again.";
const GENERIC_ERROR = "Something went wrong. Please try again.";

async function fetchMe() {
  try {
    const res = await fetch("/api/auth/me", { cache: "no-store" });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function postJson(path, body) {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { ok: res.ok, status: res.status, data: await res.json().catch(() => null) };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

// Shapes the API response for forms: { ok: true, user } or
// { ok: false, status, error, errors } where `errors` maps field -> message.
function toResult({ ok, status, data }) {
  if (ok) return { ok, user: data };
  return {
    ok: false,
    status,
    error: data?.error ?? (status === 0 ? NETWORK_ERROR : GENERIC_ERROR),
    errors: data?.errors ?? {},
  };
}

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Bumped by every login / register / logout, so a slow initial /me response
  // can't overwrite a newer result.
  const version = useRef(0);

  useEffect(() => {
    let ignore = false;
    const startedAt = version.current;
    fetchMe().then((me) => {
      if (ignore) return;
      if (version.current === startedAt) setUser(me);
      setLoading(false);
    });
    return () => {
      ignore = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    const startedAt = ++version.current;
    const me = await fetchMe();
    if (version.current === startedAt) setUser(me);
    return me;
  }, []);

  const login = useCallback(async ({ email, password }) => {
    version.current++;
    const result = toResult(await postJson("/api/auth/login", { email, password }));
    if (result.ok) setUser(result.user);
    return result;
  }, []);

  const register = useCallback(async (details) => {
    version.current++;
    const result = toResult(await postJson("/api/auth/register", details));
    if (result.ok) setUser(result.user);
    return result;
  }, []);

  const logout = useCallback(async () => {
    version.current++;
    const response = await postJson("/api/auth/logout");
    if (response.ok) setUser(null);
    return response.ok ? { ok: true } : toResult(response);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, refresh }),
    [user, loading, login, register, logout, refresh],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
