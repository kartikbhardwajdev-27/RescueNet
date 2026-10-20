import Card from "@/components/Card";
import PageHeader from "@/components/PageHeader";

export const metadata = { title: "Map" };

export default function MapPage() {
  return (
    <>
      <PageHeader title="Map" description="Live map of incidents, shelters and safe routes." />
      <Card className="min-h-64" />
    </>
  );
}
