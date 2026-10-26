"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function SellerCodActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  if (!["PREPARING", "SHIPPING", "COMPLETED"].includes(status)) return null;
  async function act(collect: boolean) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(collect ? `/api/seller/cod-payments/${encodeURIComponent(id)}` : `/api/seller/orders/${encodeURIComponent(id)}`, {
        method: collect ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(collect ? {} : { status: "CANCELLED" }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Không thể cập nhật đơn.");
      setMessage(collect ? "Đã xác nhận thu tiền COD." : "Đã hủy đơn và hoàn lại tồn kho.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể cập nhật đơn.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  return <div className="seller-form">
    <button type="button" disabled={busy} onClick={() => void act(true)}>{busy ? "Đang cập nhật…" : "Xác nhận đã thu tiền"}</button>
    {status !== "COMPLETED" && <button className="seller-button-danger" type="button" disabled={busy} onClick={() => void act(false)}>Hủy đơn COD chưa thu tiền</button>}
    <p role="status">{message}</p>
  </div>;
}
