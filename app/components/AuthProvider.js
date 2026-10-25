"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/apiClient";
import { keepSignIn, notLoggedIn, signInBody, signOutHere } from "@/lib/clientSession";
import useOutbox from "./useOutbox";

const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

const NETWORK_ERROR = "Couldn't reach the server. Check your connection and try again.";
const GENERIC_ERROR = "Something went wrong. Please try again.";

// Resolves { user } (the person, or null when the server clearly says "not
// logged in": a 401), or { user: null, unreachable: true } when it could not
// tell: no connection, or the server or its database is failing. Not being able
// to find out is not the same as being logged out, so callers must not treat it
// that way (the account page would send you to the login screen while offline).
async function fetchMe() {
  try {
    const res = await apiFetch("/api/auth/me", { cache: "no-store" });
    if (res.ok) return { user: await res.json() };
    if (res.status === 401) {
      await notLoggedIn();
      return { user: null };
    }
    return { user: null, unreachable: true };
  } catch {
    return { user: null, unreachable: true };
  }
}

async function postJson(path, body) {
  try {
    const res = await apiFetch(path, {
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

// Login and registration: post the form, let clientSession keep whatever this
// client needs to stay logged in (nothing for the website's cookie), shape the
// answer for the form.
async function signIn(path, body) {
  return toResult(await keepSignIn(await postJson(path, signInBody(body))));
}

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // The last attempt to find out who is logged in could not reach the server.
  const [unreachable, setUnreachable] = useState(false);
  // Bumped by every login / register / logout, so a slow initial /me response
  // can't overwrite a newer result.
  const version = useRef(0);

  useEffect(() => {
    let ignore = false;
    const startedAt = version.current;
    fetchMe().then((me) => {
      if (ignore) return;
      if (version.current === startedAt) {
        setUser(me.user);
        setUnreachable(Boolean(me.unreachable));
      }
      setLoading(false);
    });
    return () => {
      ignore = true;
    };
  }, []);

  // Opened while the server was unreachable, so we never learned who is logged
  // in: ask again as soon as it can be reached.
  const { serverState } = useOutbox();

  const refresh = useCallback(async () => {
    const startedAt = ++version.current;
    const me = await fetchMe();
    if (version.current === startedAt) {
      // Keep who we had if the server could not be asked.
      if (!me.unreachable) setUser(me.user);
      setUnreachable(Boolean(me.unreachable));
    }
    return me.user;
  }, []);

  useEffect(() => {
    if (!unreachable || serverState !== "online") return;
    let ignore = false;
    const startedAt = ++version.current;
    fetchMe().then((me) => {
      if (ignore || version.current !== startedAt) return;
      if (!me.unreachable) setUser(me.user);
      setUnreachable(Boolean(me.unreachable));
    });
    return () => {
      ignore = true;
    };
  }, [unreachable, serverState]);

  const login = useCallback(async ({ email, password }) => {
    version.current++;
    const result = await signIn("/api/auth/login", { email, password });
    if (result.ok) {
      setUser(result.user);
      setUnreachable(false);
    }
    return result;
  }, []);

  const register = useCallback(async (details) => {
    version.current++;
    const result = await signIn("/api/auth/register", details);
    if (result.ok) {
      setUser(result.user);
      setUnreachable(false);
    }
    return result;
  }, []);

  const logout = useCallback(async () => {
    version.current++;
    const response = await postJson("/api/auth/logout");
    // The app's login lives on the phone, so it can always log out, even with
    // the laptop out of reach. The website needs the server to drop its cookie.
    if (await signOutHere()) {
      setUser(null);
      return { ok: true };
    }
    if (response.ok) setUser(null);
    return response.ok ? { ok: true } : toResult(response);
  }, []);

  const value = useMemo(
    () => ({ user, loading, unreachable, login, register, logout, refresh }),
    [user, loading, unreachable, login, register, logout, refresh],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
