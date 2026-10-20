"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LoaderCircle, LogOut } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import Avatar from "./Avatar";
import { ROLE_LABELS } from "./labels";
import useLogout from "./useLogout";

const secondaryLink =
  "flex items-center justify-center rounded-2xl border border-line-strong px-3 py-2.5 text-sm font-semibold transition-all duration-150 motion-safe:active:scale-95";

// Desktop sidebar block that sits above the SOS button.
export default function SidebarAccount() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const { logout, pending } = useLogout();

  // Same height as the logged-out state, so nothing jumps while the session loads.
  if (loading) return <div aria-hidden="true" className="h-11 rounded-2xl bg-white/5 motion-safe:animate-pulse" />;

  if (!user) {
    return (
      <div className="grid grid-cols-2 gap-2">
        <Link
          href="/login"
          aria-current={pathname === "/login" ? "page" : undefined}
          className={`${secondaryLink} ${pathname === "/login" ? "bg-white/15" : "bg-white/5 hover:bg-white/10"}`}
        >
          Log in
        </Link>
        <Link
          href="/register"
          aria-current={pathname === "/register" ? "page" : undefined}
          className={`${secondaryLink} border-transparent bg-brand-gradient font-bold text-on-brand shadow-brand hover:brightness-110`}
        >
          Sign up
        </Link>
      </div>
    );
  }

  const onAccount = pathname === "/account";
  return (
    <div className="flex flex-col gap-1.5">
      <Link
        href="/account"
        aria-current={onAccount ? "page" : undefined}
        className={`flex items-center gap-3 rounded-2xl border p-2.5 transition-colors duration-150 ${
          onAccount ? "border-brand-to/60 bg-white/10" : "border-line bg-white/5 hover:bg-white/10"
        }`}
      >
        <Avatar name={user.name} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{user.name}</span>
          <span className="block text-xs text-ink-muted">{ROLE_LABELS[user.role] ?? user.role}</span>
        </span>
      </Link>
      <button
        type="button"
        onClick={logout}
        disabled={pending}
        aria-busy={pending}
        className="flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold text-ink-muted transition-colors duration-150 hover:bg-white/10 hover:text-ink disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? (
          <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden="true" />
        ) : (
          <LogOut className="size-4" aria-hidden="true" />
        )}
        {pending ? "Logging out…" : "Log out"}
      </button>
    </div>
  );
}
