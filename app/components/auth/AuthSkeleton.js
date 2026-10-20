import Card from "@/components/Card";

// Placeholder while the session loads or a redirect is in flight.
export default function AuthSkeleton({ className = "max-w-md" }) {
  return (
    <Card aria-busy="true" aria-label="Loading" className={`${className} flex flex-col gap-4`}>
      <span className="h-12 w-full rounded-2xl bg-white/5 motion-safe:animate-pulse" />
      <span className="h-12 w-full rounded-2xl bg-white/5 motion-safe:animate-pulse" />
      <span className="h-12 w-2/3 rounded-2xl bg-white/5 motion-safe:animate-pulse" />
    </Card>
  );
}
