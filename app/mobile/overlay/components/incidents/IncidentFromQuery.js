"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Card from "@/components/Card";
import IncidentDetail from "@/components/incidents/IncidentDetail";

// The app's version of /incidents/<id>. A static export cannot make a page for
// every incident id, so the id travels in the address instead:
// /incidents/view?id=<id> (see lib/incidentLinks.js).
export default function IncidentFromQuery() {
  const id = useSearchParams().get("id");
  if (!id) {
    return (
      <Card lift={false} className="max-w-2xl">
        <h2 className="font-display text-xl font-bold">No incident chosen</h2>
        <p className="mt-1 text-sm text-ink-muted">Open an incident from Home, the map or your reports.</p>
        <Link href="/" className="mt-4 inline-block text-sm font-semibold text-brand-to underline-offset-4 hover:underline">
          Go to Home
        </Link>
      </Card>
    );
  }
  return <IncidentDetail id={id} />;
}
