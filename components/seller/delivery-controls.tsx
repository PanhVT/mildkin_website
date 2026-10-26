"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DELIVERY_ASSIGNEES } from "@/lib/seller/delivery-config";
import type { DeliveryOrder } from "@/lib/seller/delivery";
import { sellerMutation } from "@/lib/seller/request";

type DeliveryControlOrder = Pick<DeliveryOrder, "id" | "shipping_method" | "payment_status" | "delivery_assignee" | "delivery_status">;
export function DeliveryControls({ order, assignmentOnly = false, table = false }: { order: DeliveryControlOrder; assignmentOnly?: boolean; table?: boolean }) {
  const router = useRouter();
  const lock = useRef(false);
  const [selection, setSelection] = useState({ base: order.delivery_assignee, value: order.delivery_assignee || "" });
  const assignee = selection.base === order.delivery_assignee ? selection.value : order.delivery_assignee || "";
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [failed, setFailed] = useState(false);
  const pickup = order.shipping_method === "PICKUP", completed = order.delivery_status === "COMPLETED";
  async function save(input: Record<string, unknown>, success: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true); setMessage(""); setFailed(false);
    try {
      await sellerMutation(`/api/seller/delivery/${encodeURIComponent(order.id)}`, input);
      setMessage(success);
      window.dispatchEvent(new CustomEvent("mildkin:delivery-saved", { detail: success }));
    } catch (error) {
      setFailed(true); setMessage(error instanceof Error ? error.message : "Không thể cập nhật giao/bàn giao.");
    } finally { setBusy(false); lock.current = false; }
    router.refresh();
  }
  const next = !pickup && order.delivery_status === "WAITING" ? "IN_DELIVERY"
    : (pickup && order.delivery_status === "WAITING") || order.delivery_status === "IN_DELIVERY" ? "COMPLETED" : null;
  const assignment = table && completed ? <span>{order.delivery_assignee || "Chưa phân công"}</span> : <form onSubmit={event => {
      event.preventDefault();
      if (!assignee || assignee === order.delivery_assignee) return;
      const confirmReassign = order.delivery_status === "IN_DELIVERY";
      if (confirmReassign && !window.confirm("Đơn đang được giao. Bạn có chắc muốn đổi người phụ trách?")) return;
      void save({ action: "assign", assignee, expectedAssignee: order.delivery_assignee, expectedStatus: order.delivery_status, confirmReassign }, "Đã lưu người phụ trách.");
    }}>
      <label className={table ? "delivery-sr-only" : undefined} htmlFor={`assignee-${order.id}`}>{pickup ? "Người phụ trách bàn giao" : "Người phụ trách giao đơn"}</label>
      <div className="delivery-assignment">
        <select id={`assignee-${order.id}`} value={assignee} disabled={busy || completed} onChange={event => setSelection({ base: order.delivery_assignee, value: event.target.value })}>
          <option value="">Chưa phân công</option>
          {DELIVERY_ASSIGNEES.map(name => <option key={name}>{name}</option>)}
        </select>
        {(!table || (assignee && assignee !== order.delivery_assignee)) && <button aria-label="Lưu người phụ trách" disabled={busy || completed || !assignee || assignee === order.delivery_assignee}>Lưu</button>}
      </div>
    </form>;
  const actions = <>
    {!completed && !order.delivery_assignee && (table
      ? <button type="button" disabled={busy} onClick={() => document.getElementById(`assignee-${order.id}`)?.focus()}>Phân công</button>
      : <p>Vui lòng chọn và lưu người phụ trách trước.</p>)}
    {!assignmentOnly && next && <button disabled={busy || !order.delivery_assignee} onClick={() => void save({ action: "status", status: next }, next === "IN_DELIVERY" ? "Đã bắt đầu giao đơn." : pickup ? "Đã xác nhận bàn giao." : "Đã xác nhận giao hàng.")}>
      {next === "IN_DELIVERY" ? "Bắt đầu giao" : pickup ? (table ? "Đã bàn giao" : "Xác nhận đã bàn giao") : (table ? "Đã giao" : "Xác nhận đã giao")}
    </button>}
    {table && completed && <span className="delivery-complete">✓ Hoàn tất</span>}
    {!assignmentOnly && next === "COMPLETED" && order.payment_status !== "PAID" && <p className="delivery-action-hint">{table ? "Xác nhận thu tiền trong chi tiết đơn trước." : "Cần xác nhận đã thu tiền trong chi tiết đơn trước khi hoàn tất."}</p>}
    {busy && <p role="status">Đang lưu…</p>}
    {message && <p className={`delivery-feedback ${failed ? "is-error" : ""}`} role={failed ? "alert" : "status"}>{message}</p>}
  </>;
  if (table) return <>
    <td data-label="Người phụ trách" className="delivery-controls delivery-assignee-cell"><div>{assignment}</div></td>
    <td data-label="Thao tác" className="delivery-controls delivery-action-cell"><div aria-busy={busy}>{actions}</div></td>
  </>;
  return <div className="delivery-controls">{assignment}{actions}</div>;
}

// Kept above the filtered list so success remains visible even when a row leaves its filter.
export function DeliveryNotice() {
  const [message, setMessage] = useState("");
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const show = (event: Event) => {
      setMessage((event as CustomEvent<string>).detail);
      clearTimeout(timer);
      timer = setTimeout(() => setMessage(""), 5000);
    };
    window.addEventListener("mildkin:delivery-saved", show);
    return () => { window.removeEventListener("mildkin:delivery-saved", show); clearTimeout(timer); };
  }, []);
  return message ? <div className="delivery-toast" role="status">{message}</div> : null;
}
