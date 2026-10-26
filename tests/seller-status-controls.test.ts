import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { allowedOrderTransitions } from "@/lib/seller/order-status";
import { OrderStatusControls } from "@/components/seller/order-status-controls";
import { orderStatusLabel } from "@/lib/seller/order-status";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
beforeEach(() => vi.stubGlobal("React", React));
const base = { status: "PREPARING", payment_status: "PENDING", payment_method: "COD", shipping_method: "PICKUP" };
it("shows separate Vietnamese controls and blocks unpaid pickup completion", () => {
  const html = renderToStaticMarkup(React.createElement(OrderStatusControls, { id: "guest", order: base }));
  expect(html).toContain("Trạng thái đơn hàng");
  expect(html).toContain("Trạng thái thanh toán");
  expect(html).toContain("Chưa thu tiền");
  expect(html).toContain("Đã thu tiền");
  expect(html).not.toContain('value="COMPLETED"');
  expect(html).not.toContain('value="SHIPPING"');
});
it("keeps bank transfer read only and never offers a paid downgrade", () => {
  for (const payment_status of ["PENDING", "PAID"]) {
    const html = renderToStaticMarkup(React.createElement(OrderStatusControls, { id: "bank", order: { ...base, payment_method: "BANK_TRANSFER", payment_status } }));
    expect(html).toContain("Chuyển khoản được xác nhận tự động qua SePay");
    expect(html).not.toContain("Lưu trạng thái thanh toán");
  }
});
it("uses existing statuses for delivery and pickup and protects terminal states", () => {
  expect(allowedOrderTransitions({ ...base, status: "PAID", payment_status: "PAID" })).toEqual(["PREPARING"]);
  expect(allowedOrderTransitions({ ...base, payment_status: "PAID" })).toEqual(["COMPLETED"]);
  expect(allowedOrderTransitions({ ...base, shipping_method: "DELIVERY" })).toEqual(["SHIPPING", "CANCELLED"]);
  expect(allowedOrderTransitions({ ...base, status: "SHIPPING", payment_status: "PAID" })).toEqual(["COMPLETED"]);
  expect(allowedOrderTransitions({ ...base, status: "COMPLETED" })).toEqual([]);
  expect(allowedOrderTransitions({ ...base, status: "CANCELLED" })).toEqual([]);
});
it("offers explicit COD acceptance without a payment action while awaiting confirmation", () => {
  const order = { ...base, status: "PENDING_PAYMENT" };
  const html = renderToStaticMarkup(React.createElement(OrderStatusControls, { id: "guest", order }));
  expect(html).toContain("Xác nhận &amp; bắt đầu chuẩn bị");
  expect(html).toContain("Chờ xác nhận");
  expect(html).not.toContain("Lưu trạng thái thanh toán");
  expect(allowedOrderTransitions(order)).toEqual(["PREPARING", "CANCELLED"]);
  expect(allowedOrderTransitions({ ...order, payment_method: "BANK_TRANSFER" })).toEqual(["CANCELLED"]);
  expect(orderStatusLabel("PENDING_PAYMENT", "BANK_TRANSFER")).toBe("Chờ thanh toán");
});
