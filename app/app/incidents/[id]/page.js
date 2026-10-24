import { Suspense } from "react";
import IncidentDetail from "@/components/incidents/IncidentDetail";
import PageHeader from "@/components/PageHeader";
import { Skeleton } from "@/components/home/states";

export const metadata = { title: "Incident" };

// An incident's id is only known when someone opens its page, but the layout's
// sidebar and tab bar read the current path (to mark the active link), and with
// Cache Components that must be known when the page is prepared ahead of time.
// Giving the route one placeholder path makes it so, and every other id is
// rendered on demand. (Wrapping the layout components in <Suspense> instead also
// builds, but it caused intermittent hydration errors on other pages.) The
// placeholder id matches no incident, so that page is simply "not found".
export function generateStaticParams() {
  return [{ id: "000000000000000000000000" }];
}

// The id comes from the address, so it is read below a <Suspense> boundary: the
// page's shell (the heading) is prepared ahead of time and only the incident
// streams in. The incident itself is loaded by the client component, like the
// rest of the app's data.
export default function IncidentPage({ params }) {
  return (
    <>
      <PageHeader title="Incident" description="What was reported, where and when." />
      <Suspense fallback={<Skeleton className="h-64 max-w-2xl" />}>
        <Incident params={params} />
      </Suspense>
    </>
  );
}

async function Incident({ params }) {
  const { id } = await params;
  return <IncidentDetail id={id} />;
}
