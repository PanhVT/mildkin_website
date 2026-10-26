import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { DeliveryTable } from "@/components/seller/delivery-table";
import type { DeliveryOrder } from "@/lib/seller/delivery";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
beforeEach(() => vi.stubGlobal("React", React));
const base: DeliveryOrder = { id: "one", order_code: "MKCB44FA3D98", customer_name: "Phương Anh", phone: "0981541657", created_at: 1, total: 44000, status: "PREPARING", payment_status: "PENDING", payment_method: "COD", shipping_method: "DELIVERY", address: "260 Cầu Giấy", ward: "Cầu Giấy", district: "", city: "Hà Nội", delivery_assignee: "Hồng Anh", delivery_status: "WAITING", assigned_at: 1, delivery_started_at: null, delivered_at: null };
const render = (orders: DeliveryOrder[]) => renderToStaticMarkup(React.createElement(DeliveryTable, { orders }));
it("renders nine semantic columns, one compact assignment and one action per row", () => {
  const html = render([base]);
  expect(html.match(/<th scope="col"/g)).toHaveLength(9);
  expect(html.match(/<td /g)).toHaveLength(9);
  expect(html.match(/<select /g)).toHaveLength(1);
  expect(html).toContain("MKCB44FA3D98");
  expect(html).toContain("tel:0981541657");
  expect(html).toContain("260 Cầu Giấy, Cầu Giấy, Hà Nội");
  expect(html).toContain("Bắt đầu giao");
  expect(html).toContain('data-label="Người phụ trách"');
  expect(html).not.toContain("delivery-order-content");
});
it("renders NEU pickup labels without leaking a delivery address or a start-delivery action", () => {
  const html = render([{ ...base, shipping_method: "PICKUP", address: "SHOULD_NOT_SHOW" }]);
  expect(html).toContain("Nhận tại NEU");
  expect(html).toContain('title="NEU"');
  expect(html).toContain("Chờ khách nhận");
  expect(html).toContain("Đã bàn giao");
  expect(html).not.toContain("SHOULD_NOT_SHOW");
  expect(html).not.toContain("Bắt đầu giao");
});
it("shows completed as read-only and preserves the empty state", () => {
  const html = render([{ ...base, status: "COMPLETED", delivery_status: "COMPLETED", payment_status: "PAID" }]);
  expect(html).toContain("✓ Hoàn tất");
  expect(html).toContain("Đã giao");
  expect(html).not.toContain("<select");
  expect(html).not.toContain("<button");
  expect(render([])).toContain("Chưa có đơn giao/bàn giao phù hợp.");
});
