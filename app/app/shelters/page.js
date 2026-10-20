import Card from "@/components/Card";
import PageHeader from "@/components/PageHeader";

export const metadata = { title: "Shelters" };

export default function SheltersPage() {
  return (
    <>
      <PageHeader title="Shelters" description="Find nearby emergency shelters and their availability." />
      <Card className="min-h-64" />
    </>
  );
}
