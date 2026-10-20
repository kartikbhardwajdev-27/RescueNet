"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Siren } from "lucide-react";
import { NAV_ITEMS, isActive } from "./navItems";
import { useSos } from "./SosProvider";

const TABS = NAV_ITEMS.filter((item) => item.mobile === "tab");
const LEFT_TABS = TABS.slice(0, 2);
const RIGHT_TABS = TABS.slice(2);

function Tab({ item, pathname }) {
  const { href, label, shortLabel, icon: Icon } = item;
  const active = isActive(pathname, href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className="group flex flex-col items-center gap-1 rounded-2xl px-1 py-1.5 motion-safe:active:scale-95"
    >
      <span
        className={`flex h-8 w-14 items-center justify-center rounded-full transition-all duration-150 ${
          active
            ? "bg-brand-gradient text-on-brand shadow-brand"
            : "text-ink-muted group-hover:bg-white/10 group-hover:text-ink"
        }`}
      >
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className={`text-[11px] font-semibold ${active ? "text-ink" : "text-ink-muted"}`}>
        {shortLabel ?? label}
      </span>
    </Link>
  );
}

// Mobile only (under 768px): Home, Map, raised SOS, Report, Shelters.
export default function BottomNav() {
  const pathname = usePathname();
  const { openSos } = useSos();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 items-end rounded-3xl border border-line bg-glass px-1 pt-1 pb-1 shadow-card backdrop-blur-xl md:hidden"
    >
      {LEFT_TABS.map((item) => (
        <Tab key={item.href} item={item} pathname={pathname} />
      ))}

      <div className="flex justify-center">
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label="Emergency SOS"
          onClick={openSos}
          className="-mt-8 mb-1 flex size-16 flex-col items-center justify-center gap-0.5 rounded-full bg-sos font-display text-white shadow-sos ring-4 ring-canvas transition-colors duration-150 hover:bg-sos-hover motion-safe:animate-sos-pulse motion-safe:active:scale-90"
        >
          <Siren className="size-6" aria-hidden="true" />
          <span className="text-[11px] leading-none font-bold" aria-hidden="true">
            SOS
          </span>
        </button>
      </div>

      {RIGHT_TABS.map((item) => (
        <Tab key={item.href} item={item} pathname={pathname} />
      ))}
    </nav>
  );
}
