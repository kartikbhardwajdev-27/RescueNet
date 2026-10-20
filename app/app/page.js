import Card from "@/components/Card";
import PageHeader from "@/components/PageHeader";

export default function HomePage() {
  return (
    <>
      <PageHeader title="Home" description="Your emergency overview at a glance." />
      <Card className="min-h-64" />
    </>
  );
}
