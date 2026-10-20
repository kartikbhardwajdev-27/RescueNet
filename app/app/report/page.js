import PageHeader from "@/components/PageHeader";
import ReportForm from "@/components/report/ReportForm";

export const metadata = { title: "Report Incident" };

export default function ReportPage() {
  return (
    <>
      <PageHeader title="Report Incident" description="Report an emergency or hazard in your area." />
      <ReportForm />
    </>
  );
}
