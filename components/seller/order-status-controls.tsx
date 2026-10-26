"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { allowedOrderTransitions, orderStatusLabel, type OrderState } from "@/lib/seller/order-status";
import { statusLabels } from "@/lib/status";
import { sellerMutation } from "@/lib/seller/request";

export function OrderStatusControls({ id, order }: { id: string; order: OrderState }) {
  const router = useRouter();
  const lock = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState<{ kind: string; status: string } | null>(null);
  useEffect(() => {
    if (confirmation) dialog.current?.showModal();
  }, [confirmation]);
  const transitions = allowedOrderTransitions(order);
  const collectable = order.payment_method === "COD" && order.payment_status === "PENDING" && ["PREPARING", "SHIPPING", "COMPLETED"].includes(order.status);

  async function save(kind: string, status: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      await sellerMutation(`/api/seller/orders/${encodeURIComponent(id)}/${kind}`, { status });
      setMessage(kind === "status" ? "Đã cập nhật trạng thái đơn hàng." : "Đã cập nhật trạng thái thanh toán.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể lưu thay đổi.");
    } finally {
      setBusy(false);
      lock.current = false;
      setConfirmation(null);
    }
    // The server may have committed even when its response timed out. Release the
    // local loading state first, then reconcile status/payment from the server.
    router.refresh();
  }

  const waitingCod = order.payment_method === "COD" && order.status === "PENDING_PAYMENT" && order.payment_status === "PENDING";
  return <div className="seller-status-controls">
    {["PREPARING", "SHIPPING"].includes(order.status) && <p>{order.delivery_assignee
      ? <>Người phụ trách: <strong>{order.delivery_assignee}</strong>.</>
      : <>Chọn người phụ trách ở phần trên và bấm Lưu trước khi chuyển sang Đang giao hoặc Hoàn thành.</>} <Link href="/seller/delivery">Xem giao hàng &amp; bàn giao</Link></p>}
    {waitingCod && <button type="button" disabled={busy || !!confirmation} onClick={() => void save("status", "PREPARING")}>{busy ? "Đang lưu…" : "Xác nhận & bắt đầu chuẩn bị"}</button>}
    <form key={`order:${order.status}:${order.payment_status}`} className="seller-form" onSubmit={e => {
      e.preventDefault();
      const status = String(new FormData(e.currentTarget).get("status"));
      if (status === order.status) return;
      if (status === "CANCELLED") setConfirmation({ kind: "status", status });
      else void save("status", status);
    }}>
      <label>Trạng thái đơn hàng
        <select name="status" defaultValue={order.status} disabled={busy || !!confirmation || !transitions.length}>
          {[order.status, ...transitions].map(s => <option key={s} value={s}>{orderStatusLabel(s, order.payment_method)}</option>)}
        </select>
      </label>
      <button disabled={busy || !!confirmation || !transitions.length}>{busy ? "Đang lưu…" : "Lưu trạng thái đơn hàng"}</button>
    </form>
    <form key={`payment:${order.payment_status}`} className="seller-form" onSubmit={e => {
      e.preventDefault();
      if (new FormData(e.currentTarget).get("status") === "PAID" && collectable)
        setConfirmation({ kind: "payment-status", status: "PAID" });
    }}>
      <label>Trạng thái thanh toán
        <select name="status" defaultValue={order.payment_status} disabled={busy || !!confirmation || !collectable}>
          <option value={order.payment_status}>{order.payment_method === "COD" && order.payment_status === "PENDING" ? "Chưa thu tiền" : statusLabels[order.payment_status]}</option>
          {collectable && <option value="PAID">Đã thu tiền</option>}
        </select>
      </label>
      {collectable && <button disabled={busy || !!confirmation}>{busy ? "Đang lưu…" : "Lưu trạng thái thanh toán"}</button>}
    </form>
    {order.payment_method === "BANK_TRANSFER" && <p>Chuyển khoản được xác nhận tự động qua SePay. Chưa hỗ trợ xác nhận thủ công.</p>}
    {order.payment_method === "COD" && order.payment_status !== "PAID" && order.status !== "CANCELLED" && <p>Đơn này chưa được xác nhận thanh toán. Vui lòng xác nhận đã thu tiền trước khi hoàn thành.</p>}
    {confirmation && <dialog ref={dialog} onCancel={e => { e.preventDefault(); if (!busy) setConfirmation(null); }} aria-labelledby="seller-confirm-title" className="seller-confirm">
      <h3 id="seller-confirm-title">{confirmation.status === "CANCELLED" ? "Hủy đơn hàng này?" : "Xác nhận đã thu tiền COD?"}</h3>
      <p>{confirmation.status === "CANCELLED" ? "Hàng tồn kho đã giữ sẽ được trả lại theo logic hiện tại." : "Chỉ xác nhận khi bạn đã thực sự nhận đủ tiền của đơn hàng."}</p>
      <button className="seller-button-secondary" type="button" disabled={busy} onClick={() => setConfirmation(null)}>Quay lại</button>
      <button className={confirmation.status === "CANCELLED" ? "seller-button-danger" : undefined} type="button" disabled={busy} onClick={() => void save(confirmation.kind, confirmation.status)}>{busy ? "Đang lưu…" : "Xác nhận"}</button>
    </dialog>}
    <p role="status" aria-live="polite">{message}</p>
  </div>;
}
