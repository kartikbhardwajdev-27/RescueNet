import PageHeader from "@/components/PageHeader";
import SheltersView from "@/components/shelters/SheltersView";

export const metadata = { title: "Shelters" };

export default function SheltersPage() {
  return (
    <>
      <PageHeader title="Shelters" description="Find nearby emergency shelters and their availability." />
      <SheltersView />
    </>
  );
}
