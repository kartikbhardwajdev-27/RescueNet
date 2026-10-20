"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ellipsis, LoaderCircle, LogOut } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { NAV_ITEMS, isActive } from "@/components/navItems";
import Avatar from "./Avatar";
import { ROLE_LABELS } from "./labels";
import useLogout from "./useLogout";

const MORE_ITEMS = NAV_ITEMS.filter((item) => item.mobile === "top");

const menuButton =
  "flex items-center justify-center rounded-2xl border border-line-strong px-3 py-2.5 text-sm font-semibold transition-all duration-150 motion-safe:active:scale-95";

// Mobile top-bar controls: a Log in pill (or the account avatar) and a "More"
// menu holding the same account items plus the pages that don't fit the tab bar.
export default function MobileAccount() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const { logout, pending } = useLogout();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const moreButtonRef = useRef(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      moreButtonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function handleLogout() {
    close();
    await logout();
  }

  return (
    <div ref={rootRef} className="relative flex items-center gap-1.5">
      {loading && <span aria-hidden="true" className="size-9 rounded-full bg-white/5 motion-safe:animate-pulse" />}
      {!loading && !user && (
        <Link
          href="/login"
          className="flex h-11 items-center rounded-2xl bg-brand-gradient px-4 text-sm font-bold text-on-brand shadow-brand transition-all duration-150 hover:brightness-110 motion-safe:active:scale-95"
        >
          Log in
        </Link>
      )}
      {!loading && user && (
        <Link
          href="/account"
          aria-label={`Account: ${user.name}`}
          className="flex size-11 items-center justify-center rounded-2xl transition-colors duration-150 hover:bg-white/10"
        >
          <Avatar name={user.name} className="size-9 text-sm" />
        </Link>
      )}

      <button
        ref={moreButtonRef}
        type="button"
        aria-label="More"
        aria-expanded={open}
        aria-controls="more-menu"
        onClick={() => setOpen((o) => !o)}
        className="flex size-11 items-center justify-center rounded-2xl text-ink-muted transition-colors duration-150 hover:bg-white/10 hover:text-ink motion-safe:active:scale-95"
      >
        <Ellipsis className="size-6" aria-hidden="true" />
      </button>

      {open && (
        <div
          id="more-menu"
          className="absolute top-full right-0 mt-3 w-64 rounded-3xl border border-line-strong bg-surface-raised p-2 shadow-card-hover"
        >
          {!loading && !user && (
            <div className="grid grid-cols-2 gap-2 p-1">
              <Link href="/login" onClick={close} className={`${menuButton} bg-white/5 hover:bg-white/10`}>
                Log in
              </Link>
              <Link
                href="/register"
                onClick={close}
                className={`${menuButton} border-transparent bg-brand-gradient font-bold text-on-brand shadow-brand hover:brightness-110`}
              >
                Sign up
              </Link>
            </div>
          )}
          {!loading && user && (
            <div className="flex flex-col gap-1 p-1">
              <Link
                href="/account"
                onClick={close}
                aria-current={pathname === "/account" ? "page" : undefined}
                className="flex items-center gap-3 rounded-2xl border border-line bg-white/5 p-2.5 hover:bg-white/10"
              >
                <Avatar name={user.name} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{user.name}</span>
                  <span className="block text-xs text-ink-muted">{ROLE_LABELS[user.role] ?? user.role}</span>
                </span>
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                disabled={pending}
                className="flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left text-sm font-semibold text-ink-muted transition-colors hover:bg-white/10 hover:text-ink disabled:opacity-70"
              >
                {pending ? (
                  <LoaderCircle className="size-5 motion-safe:animate-spin" aria-hidden="true" />
                ) : (
                  <LogOut className="size-5" aria-hidden="true" />
                )}
                Log out
              </button>
            </div>
          )}

          <hr className="my-1.5 border-line" />

          <nav aria-label="More pages" className="flex flex-col gap-1">
            {MORE_ITEMS.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={close}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-semibold transition-colors ${
                    active ? "bg-brand-gradient text-on-brand" : "text-ink-muted hover:bg-white/10 hover:text-ink"
                  }`}
                >
                  <Icon className="size-5 shrink-0" aria-hidden="true" />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </div>
  );
}
