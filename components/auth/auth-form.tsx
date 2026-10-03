"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Heart } from "lucide-react";
import { loginSchema, registerSchema } from "@/lib/auth/validation";
export function AuthForm({
  mode,
  next = "/account",
}: {
  mode: "login" | "register";
  next?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const signingUp = mode === "register";
  const fields = [
    ...(signingUp
      ? [
          {
            key: "name",
            label: "Họ và tên",
            type: "text",
            auto: "name",
            required: true,
          },
          {
            key: "phone",
            label: "Số điện thoại (không bắt buộc)",
            type: "tel",
            auto: "tel",
            required: false,
          },
        ]
      : []),
    {
      key: "email",
      label: "Email",
      type: "email",
      auto: "email",
      required: true,
    },
    {
      key: "password",
      label: "Mật khẩu",
      type: "password",
      auto: signingUp ? "new-password" : "current-password",
      required: true,
    },
    ...(signingUp
      ? [
          {
            key: "confirmPassword",
            label: "Nhập lại mật khẩu",
            type: "password",
            auto: "new-password",
            required: true,
          },
        ]
      : []),
  ];
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setErrors({});
    const input = Object.fromEntries(new FormData(event.currentTarget));
    const result = (signingUp ? registerSchema : loginSchema).safeParse(input);
    if (!result.success) {
      setErrors(
        Object.fromEntries(
          result.error.issues.map((issue) => [
            String(issue.path[0]),
            issue.message,
          ]),
        ),
      );
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...result.data, next }),
      });
      const data = (await response.json()) as {
        error?: string;
        redirectTo?: string;
      };
      if (!response.ok)
        throw new Error(data.error || "Chưa thể đăng nhập. Vui lòng thử lại.");
      router.replace(data.redirectTo || "/account");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Kết nối bị gián đoạn. Vui lòng thử lại.",
      );
      setBusy(false);
    }
  }
  return (
    <div className="auth-card">
      <Heart className="auth-heart" size={30} aria-hidden="true" />
      <span className="eyebrow">YOUR LITTLE MILDKIN CORNER</span>
      <h1>{signingUp ? "Tạo tài khoản Mildkin" : "Chào bạn quay lại"}</h1>
      <p>
        {signingUp
          ? "Lưu lại những đơn bánh và những khoảnh khắc ngọt ngào của bạn."
          : "Đăng nhập để xem những đơn bánh của bạn."}
      </p>
      <form onSubmit={submit} noValidate>
        {fields.map((field) => (
          <div className="field" key={field.key}>
            <label htmlFor={`auth-${field.key}`}>{field.label}</label>
            <input
              id={`auth-${field.key}`}
              name={field.key}
              type={field.type}
              autoComplete={field.auto}
              required={field.required}
              maxLength={
                field.key === "email"
                  ? 254
                  : field.key === "phone"
                    ? 12
                    : field.key === "name"
                      ? 100
                      : 128
              }
              aria-invalid={Boolean(errors[field.key])}
              aria-describedby={
                errors[field.key]
                  ? `error-${field.key}`
                  : field.key === "password" && signingUp
                    ? "password-help"
                    : undefined
              }
              disabled={busy}
            />
            {errors[field.key] && (
              <p id={`error-${field.key}`} className="form-error">
                {errors[field.key]}
              </p>
            )}
          </div>
        ))}
        {signingUp && (
          <p id="password-help" className="auth-help">
            Ít nhất 8 ký tự, gồm chữ và số. Bạn nên chọn mật khẩu dài và riêng
            cho Mildkin.
          </p>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button className="button full-width" disabled={busy}>
          {busy ? "Đang xử lý…" : signingUp ? "Tạo tài khoản" : "Đăng nhập"}
          <ArrowRight size={17} />
        </button>
      </form>
      <p className="auth-switch">
        {signingUp ? "Đã có tài khoản?" : "Chưa có tài khoản?"}{" "}
        <Link
          href={
            signingUp ? `/login?next=${encodeURIComponent(next)}` : "/register"
          }
        >
          {signingUp ? "Đăng nhập" : "Tạo tài khoản"}
        </Link>
      </p>
      <Link className="auth-guest" href="/checkout">
        Tiếp tục đặt bánh không cần tài khoản
      </Link>
    </div>
  );
}
