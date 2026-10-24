import { Info } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import EmergencyNumbers from "@/components/resources/EmergencyNumbers";
import GuideCard from "@/components/resources/GuideCard";
import { GENERAL_GUIDANCE_NOTE, GUIDES } from "@/components/resources/resourceData";

export const metadata = { title: "Resources" };

// Static on purpose: no data, no requests, so it opens with no connection at
// all (the service worker saves this page like the others).
export default function ResourcesPage() {
  return (
    <>
      <PageHeader title="Resources" description="Emergency numbers and short safety guides. This page works with no internet." />

      <div className="flex flex-col gap-10">
        <p
          role="note"
          className="flex items-start gap-3 rounded-2xl border border-info/30 bg-info/10 px-4 py-3 text-sm font-semibold sm:items-center"
        >
          <Info className="mt-0.5 size-5 shrink-0 text-info sm:mt-0" aria-hidden="true" />
          {GENERAL_GUIDANCE_NOTE}
        </p>

        <EmergencyNumbers />

        <section aria-labelledby="guides-heading">
          <h2 id="guides-heading" className="font-display text-2xl font-bold tracking-tight">
            What to do
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Short, basic steps. In a real emergency, call first when you can.
          </p>
          <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
            {GUIDES.map((guide) => (
              <GuideCard key={guide.id} guide={guide} />
            ))}
          </div>
        </section>

        <p className="flex items-start gap-2.5 text-sm text-ink-muted">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {GENERAL_GUIDANCE_NOTE} This page is not a substitute for a first-aid course or for the advice of emergency services.
        </p>
      </div>
    </>
  );
}
