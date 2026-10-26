"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { instagramProfileUrl } from "@/lib/instagram";

export function InstagramContact({ id, username, contactedAt: initialContactedAt, confirmed }: {
  id: string; username: string | null; contactedAt: number | null; confirmed: boolean;
}) {
  const router = useRouter();
  const [contactedAt, setContactedAt] = useState(initialContactedAt);
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const url = instagramProfileUrl(username);
  async function act(copy: boolean) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage(""); setError(false);
    try {
      const response = await fetch(`/api/seller/orders/${encodeURIComponent(id)}/${copy ? "instagram-message" : "instagram-contact"}`, {
        method: copy ? "GET" : "PATCH", signal: AbortSignal.timeout(20000),
        ...(copy ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contacted: contactedAt === null }) }),
      });
      const data = await response.json() as { error?: string; message: string; instagram_contacted_at: number | null };
      if (!response.ok) throw new Error(data.error || "Không thể cập nhật liên hệ.");
      if (copy) {
        try { await navigator.clipboard.writeText(data.message); }
        catch { throw new Error("Chưa sao chép được. Vui lòng cho phép truy cập clipboard và thử lại."); }
        setMessage("Đã sao chép tin nhắn xác nhận");
      } else { setContactedAt(data.instagram_contacted_at); }
    } catch (e) { setError(true); setMessage(e instanceof Error ? e.message : "Kết nối bị gián đoạn. Vui lòng thử lại."); }
    finally { lock.current = false; setBusy(false); if (!copy) router.refresh(); }
  }
  const timestamp = contactedAt === null ? "" : [
    new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit" }).format(contactedAt),
    new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(contactedAt),
  ].join(" ");
  return <section className="seller-card seller-instagram">
    <h2>Liên hệ khách hàng</h2>
    <p>Instagram: <strong>{url ? `@${username}` : "Chưa có Instagram (đơn cũ)"}</strong></p>
    <p className={`seller-badge ${contactedAt === null ? "" : "seller-good"}`}>{contactedAt === null ? "Chưa liên hệ" : `Đã liên hệ · ${timestamp}`}</p>
    <div className="seller-instagram-actions">
      {url && <a className="seller-instagram-link" href={url} target="_blank" rel="noopener noreferrer">Mở Instagram</a>}
      <button type="button" disabled={busy || !confirmed || !url} onClick={() => void act(true)}>Sao chép tin nhắn xác nhận</button>
      <button type="button" disabled={busy || !url} onClick={() => void act(false)}>{contactedAt === null ? "Đánh dấu đã liên hệ" : "Bỏ đánh dấu"}</button>
    </div>
    {contactedAt !== null && <p>Đã liên hệ ✓</p>}
    {!confirmed && <p className="muted">Đơn chưa được xác nhận</p>}
    {message && <p role={error ? "alert" : "status"}>{message}</p>}
  </section>;
}
