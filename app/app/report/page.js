import Card from "@/components/Card";
import PageHeader from "@/components/PageHeader";

export const metadata = { title: "Report Incident" };

export default function ReportPage() {
  return (
    <>
      <PageHeader title="Report Incident" description="Report an emergency or hazard in your area." />
      <Card className="min-h-64" />
    </>
  );
}
