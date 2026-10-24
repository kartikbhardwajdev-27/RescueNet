import { Phone } from "lucide-react";
import Card from "@/components/Card";
import { EMERGENCY_NUMBERS } from "./resourceData";

// Tap-to-call cards. A phone dials straight away; a laptop opens whatever app it
// uses for calls (or does nothing), so the number is always written big enough
// to read out.
export default function EmergencyNumbers() {
  return (
    <section aria-labelledby="numbers-heading">
      <h2 id="numbers-heading" className="font-display text-2xl font-bold tracking-tight">
        Emergency numbers
      </h2>
      <p className="mt-1 text-sm text-ink-muted">Tap a number to call. On a computer, read the number out or dial it from a phone.</p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {EMERGENCY_NUMBERS.map(({ number, label, detail, primary }) => (
          <li key={number} className={primary ? "sm:col-span-2" : undefined}>
            <Card
              as="a"
              href={`tel:${number}`}
              aria-label={`Call ${number}, ${label}`}
              padded={false}
              className={`flex items-center gap-4 p-4 sm:p-5 ${primary ? "border-sos/40 bg-sos/10" : ""}`}
            >
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-sos/15 text-sos-soft">
                <Phone className="size-6" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-3xl leading-none font-bold tracking-tight">{number}</span>
                <span className="mt-1.5 block font-semibold">{label}</span>
                <span className="mt-0.5 block text-sm text-ink-muted">{detail}</span>
              </span>
              <span className="hidden shrink-0 rounded-2xl bg-sos px-4 py-2.5 text-sm font-bold text-white shadow-sos sm:block">Call</span>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
