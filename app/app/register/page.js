import RegisterForm from "@/components/auth/RegisterForm";
import PageHeader from "@/components/PageHeader";

export const metadata = { title: "Sign up" };

export default function RegisterPage() {
  return (
    <>
      <PageHeader title="Sign up" description="Create an account as a citizen or an organization." />
      <RegisterForm />
    </>
  );
}
