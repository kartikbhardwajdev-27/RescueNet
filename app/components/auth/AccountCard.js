"use client";

import { LoaderCircle, LogOut, Mail, MapPin, Phone, WifiOff } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import Card from "@/components/Card";
import OutboxList from "@/components/outbox/OutboxList";
import Avatar from "./Avatar";
import AuthSkeleton from "./AuthSkeleton";
import { ORG_TYPE_LABELS } from "./labels";
import RoleBadge from "./RoleBadge";
import useLogout from "./useLogout";
import useRedirectWhen from "./useRedirectWhen";

function Row({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-3">
      {Icon && <Icon className="mt-0.5 size-5 shrink-0 text-ink-muted" aria-hidden="true" />}
      <div className="min-w-0">
        <dt className="text-xs font-semibold tracking-wide text-ink-muted uppercase">{label}</dt>
        <dd className="mt-0.5 break-words text-ink">{children}</dd>
      </div>
    </div>
  );
}

export default function AccountCard() {
  const { user, loading, unreachable } = useAuth();
  const { logout, pending } = useLogout();

  // Not logged in (or just logged out): go to the login page. Not when the
  // server just could not be reached: that says nothing about being logged in,
  // and the saved reports below are still worth showing.
  useRedirectWhen(!loading && !user && !unreachable, "/login");
  if (loading) return <AuthSkeleton className="max-w-2xl" />;
  if (!user && unreachable) {
    return (
      <>
        <Card lift={false} className="max-w-2xl">
          <div className="flex items-start gap-3">
            <WifiOff className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden="true" />
            <div>
              <h2 className="font-display text-lg font-bold">Your account can&apos;t be loaded right now</h2>
              <p className="mt-1 text-sm text-ink-muted">
                RescueNet can&apos;t reach its server. Your details will appear here when the connection returns.
              </p>
            </div>
          </div>
        </Card>
        <OutboxList />
      </>
    );
  }
  if (!user) return <AuthSkeleton className="max-w-2xl" />;

  const org = user.role === "organization" ? user.org : null;
  const [lng, lat] = user.location?.coordinates ?? [];

  return (
    <>
      <Card lift={false} className="max-w-2xl">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={user.name} className="size-16 text-2xl" />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-2xl font-bold tracking-tight break-words">{user.name}</h2>
            <div className="mt-1.5">
              <RoleBadge role={user.role} />
            </div>
          </div>
        </div>

        <dl className="mt-6 grid gap-5 sm:grid-cols-2">
          <Row icon={Mail} label="Email">
            {user.email}
          </Row>
          <Row icon={Phone} label="Phone">
            {user.phone}
          </Row>
          {user.location && (
            <Row icon={MapPin} label="Location">
              {lat}, {lng}
            </Row>
          )}
        </dl>

        {org && (
          <section aria-labelledby="org-heading" className="mt-6 rounded-2xl border border-line bg-white/5 p-4 sm:p-5">
            <h3 id="org-heading" className="font-display text-lg font-bold">
              Organization
            </h3>
            <dl className="mt-4 grid gap-5 sm:grid-cols-2">
              <Row label="Name">{org.orgName}</Row>
              <Row label="Type">{ORG_TYPE_LABELS[org.orgType] ?? org.orgType}</Row>
              {org.description && (
                <div className="sm:col-span-2">
                  <Row label="Description">{org.description}</Row>
                </div>
              )}
              {org.contactInfo && (
                <div className="sm:col-span-2">
                  <Row label="Contact">{org.contactInfo}</Row>
                </div>
              )}
            </dl>
          </section>
        )}

        <div className="mt-8 border-t border-line pt-6">
          <button
            type="button"
            onClick={logout}
            disabled={pending}
            aria-busy={pending}
            className="flex items-center gap-2.5 rounded-2xl border border-line-strong bg-white/5 px-5 py-3 text-sm font-bold transition-all duration-150 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-70 motion-safe:active:scale-95"
          >
            {pending ? (
              <LoaderCircle className="size-5 motion-safe:animate-spin" aria-hidden="true" />
            ) : (
              <LogOut className="size-5" aria-hidden="true" />
            )}
            {pending ? "Logging out…" : "Log out"}
          </button>
        </div>
      </Card>
      <OutboxList />
    </>
  );
}
