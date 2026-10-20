import Card from "@/components/Card";
import PageHeader from "@/components/PageHeader";

export const metadata = { title: "About" };

export default function AboutPage() {
  return (
    <>
      <PageHeader title="About" description="Learn about RescueNet and its mission." />
      <Card className="min-h-64" />
    </>
  );
}
