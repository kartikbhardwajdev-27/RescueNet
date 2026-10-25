import PageHeader from "@/components/PageHeader";
import SettingsView from "@/components/mobile/SettingsView";

export const metadata = { title: "Settings" };

// Android app only: this file is copied into the app build by
// scripts/build-mobile.mjs and does not exist in the website.
export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Where this app finds the RescueNet laptop." />
      <SettingsView />
    </>
  );
}
