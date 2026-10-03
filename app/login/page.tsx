import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { getCurrentUser } from "@/lib/auth/current-user";
import { safeNext } from "@/lib/auth/validation";
export const metadata = {
  title: "Đăng nhập",
  robots: { index: false, follow: false },
};
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeNext((await searchParams).next);
  if (await getCurrentUser()) redirect(next);
  return (
    <section className="auth-page">
      <AuthForm mode="login" next={next} />
    </section>
  );
}
