import Card from "@/components/Card";
import PageHeader from "@/components/PageHeader";

export const metadata = { title: "Resources" };

export default function ResourcesPage() {
  return (
    <>
      <PageHeader title="Resources" description="Emergency guides, contacts and safety information." />
      <Card className="min-h-64" />
    </>
  );
}
