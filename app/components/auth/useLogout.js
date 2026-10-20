"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/SosProvider";

// Logs out and confirms with the toast. `pending` drives the button's loading state.
export default function useLogout() {
  const { logout } = useAuth();
  const showToast = useToast();
  const [pending, setPending] = useState(false);

  const run = useCallback(async () => {
    setPending(true);
    const result = await logout();
    setPending(false);
    showToast(result.ok ? "Logged out" : result.error);
    return result;
  }, [logout, showToast]);

  return { logout: run, pending };
}
