import LoginForm from "@/components/auth/LoginForm";
import PageHeader from "@/components/PageHeader";

export const metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <>
      <PageHeader title="Log in" description="Welcome back. Log in to your RescueNet account." />
      <LoginForm />
    </>
  );
}
