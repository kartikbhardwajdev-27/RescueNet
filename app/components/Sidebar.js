"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Siren } from "lucide-react";
import Logo from "./Logo";
import { NAV_ITEMS, isActive } from "./navItems";
import { useSos } from "./SosProvider";

// Desktop only (768px and up). Mobile uses TopBar + BottomNav.
export default function Sidebar() {
  const pathname = usePathname();
  const { openSos } = useSos();

  return (
    <aside className="fixed top-4 bottom-4 left-4 z-40 hidden w-64 flex-col overflow-y-auto rounded-card border border-line bg-glass p-4 shadow-card backdrop-blur-xl md:flex">
      <div className="mb-8 px-1 pt-1">
        <Logo />
      </div>

      <nav aria-label="Main" className="flex flex-col gap-1.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-semibold transition-all duration-150 motion-safe:active:scale-[0.97] ${
                active
                  ? "bg-brand-gradient text-on-brand shadow-brand"
                  : "text-ink-muted hover:bg-white/10 hover:text-ink"
              }`}
            >
              <Icon className="size-5 shrink-0" aria-hidden="true" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-6">
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={openSos}
          className="flex w-full flex-col items-center gap-1.5 rounded-3xl bg-sos px-4 py-5 font-display text-base font-bold tracking-wide text-white shadow-sos transition-colors duration-150 hover:bg-sos-hover motion-safe:animate-sos-pulse motion-safe:active:scale-95"
        >
          <Siren className="size-8" aria-hidden="true" />
          EMERGENCY SOS
        </button>
      </div>
    </aside>
  );
}
