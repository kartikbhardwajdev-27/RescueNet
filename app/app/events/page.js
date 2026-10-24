import EventsView from "@/components/events/EventsView";
import PageHeader from "@/components/PageHeader";

export const metadata = { title: "Events" };

export default function EventsPage() {
  return (
    <>
      <PageHeader title="Events" description="Volunteer drives, donation camps and trainings you can join." />
      <EventsView />
    </>
  );
}
