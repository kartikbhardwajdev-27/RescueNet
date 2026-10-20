"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo";
import { NAV_ITEMS, isActive } from "./navItems";

const TOP_ITEMS = NAV_ITEMS.filter((item) => item.mobile === "top");

// Mobile only. Holds the pages that don't fit in the bottom tab bar.
export default function TopBar() {
  const pathname = usePathname();

  return (
    <header className="fixed inset-x-3 top-3 z-40 flex h-14 items-center justify-between rounded-3xl border border-line bg-glass pr-2 pl-3 shadow-card backdrop-blur-xl md:hidden">
      <Logo />
      <nav aria-label="More" className="flex items-center gap-1">
        {TOP_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className={`flex size-11 items-center justify-center rounded-2xl transition-all duration-150 motion-safe:active:scale-90 ${
                active
                  ? "bg-brand-gradient text-on-brand shadow-brand"
                  : "text-ink-muted hover:bg-white/10 hover:text-ink"
              }`}
            >
              <Icon className="size-5" aria-hidden="true" />
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
