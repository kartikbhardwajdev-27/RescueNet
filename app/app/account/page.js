import AccountCard from "@/components/auth/AccountCard";
import PageHeader from "@/components/PageHeader";

export const metadata = { title: "My account" };

export default function AccountPage() {
  return (
    <>
      <PageHeader title="My account" description="Your details and sign-in." />
      <AccountCard />
    </>
  );
}
