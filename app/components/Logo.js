import Link from "next/link";
import { ShieldPlus } from "lucide-react";

export default function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-xl">
      <span className="flex size-10 items-center justify-center rounded-2xl bg-brand-gradient text-on-brand shadow-brand">
        <ShieldPlus className="size-5" aria-hidden="true" />
      </span>
      <span className="font-display text-xl font-bold tracking-tight text-ink">RescueNet</span>
    </Link>
  );
}
