import Link from "next/link";
import { ArrowRight, Map as MapIcon } from "lucide-react";
import Card from "@/components/Card";
import SendSosButton from "./SendSosButton";

export default function Hero({ className = "" }) {
  return (
    <Card padded={false} className={`relative flex flex-col justify-center overflow-hidden p-6 sm:p-8 @3xl:p-10 ${className}`}>
      <div aria-hidden="true" className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-brand-from/25 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 left-1/3 size-64 rounded-full bg-brand-to/15 blur-3xl" />

      <div className="relative">
        <h1 className="font-display text-4xl leading-[1.05] font-bold tracking-tight sm:text-5xl @3xl:text-6xl">
          Help when
          <span className="block box-decoration-clone bg-brand-gradient bg-clip-text text-transparent">it matters most</span>
        </h1>
        <p className="mt-4 max-w-xl text-lg text-ink-muted">
          Report incidents, find shelter and call for help in seconds.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <SendSosButton />
          <Link
            href="/map"
            className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-brand-gradient px-6 py-3.5 font-display text-base font-bold text-on-brand shadow-brand transition-all duration-150 hover:brightness-110 motion-safe:active:scale-95 sm:w-auto"
          >
            <MapIcon className="size-5" aria-hidden="true" />
            View live map
            <ArrowRight className="size-5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </Card>
  );
}
