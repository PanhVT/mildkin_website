import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { getCurrentUser } from "@/lib/auth/current-user";
export const metadata = {
  title: "Tạo tài khoản",
  robots: { index: false, follow: false },
};
export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/account");
  return (
    <section className="auth-page">
      <AuthForm mode="register" />
    </section>
  );
}
