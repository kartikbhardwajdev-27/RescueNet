import { Suspense } from "react";
import IncidentFromQuery from "@/components/incidents/IncidentFromQuery";
import { Skeleton } from "@/components/home/states";
import PageHeader from "@/components/PageHeader";

export const metadata = { title: "Incident" };

// Android app only: copied into the app build by scripts/build-mobile.mjs, which
// leaves out app/incidents/[id] (a dynamic route cannot be exported). The id is
// read from the address in the browser, below a <Suspense> boundary.
export default function IncidentViewPage() {
  return (
    <>
      <PageHeader title="Incident" description="What was reported, where and when." />
      <Suspense fallback={<Skeleton className="h-64 max-w-2xl" />}>
        <IncidentFromQuery />
      </Suspense>
    </>
  );
}
