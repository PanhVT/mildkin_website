"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { profileSchema } from "@/lib/auth/validation";
export function ProfileForm({ name, phone }: { name: string; phone: string }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setMessage("");
    const parsed = profileSchema.safeParse(
      Object.fromEntries(new FormData(event.currentTarget)),
    );
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(data.error || "Chưa lưu được thay đổi.");
      setMessage("Đã lưu thông tin của bạn.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vui lòng thử lại sau.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="profile-form">
      <div className="field">
        <label htmlFor="profile-name">Họ và tên</label>
        <input
          id="profile-name"
          name="name"
          defaultValue={name}
          autoComplete="name"
          required
          maxLength={100}
          disabled={busy}
        />
      </div>
      <div className="field">
        <label htmlFor="profile-phone">Số điện thoại</label>
        <input
          id="profile-phone"
          name="phone"
          type="tel"
          defaultValue={phone}
          autoComplete="tel"
          maxLength={12}
          disabled={busy}
        />
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <button className="button" disabled={busy}>
        {busy ? "Đang lưu…" : "Lưu thay đổi"}
      </button>
    </form>
  );
}
