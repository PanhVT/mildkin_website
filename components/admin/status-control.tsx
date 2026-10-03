"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { statusLabels } from "@/lib/status";
export function StatusControl({
  code,
  status,
}: {
  code: string;
  status: string;
}) {
  const next = {
    PAID: "PREPARING",
    PREPARING: "SHIPPING",
    SHIPPING: "COMPLETED",
  }[status as "PAID" | "PREPARING" | "SHIPPING"];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  async function update() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/orders/${code}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error || "Chưa cập nhật được trạng thái.");
      }
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Chưa cập nhật được trạng thái.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="admin-status">
      <span className="status-pill">{statusLabels[status]}</span>
      {next && (
        <button className="button" disabled={busy} onClick={update}>
          {busy ? "Đang lưu…" : `Chuyển sang: ${statusLabels[next]}`}
        </button>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
