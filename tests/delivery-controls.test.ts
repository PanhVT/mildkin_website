import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DeliveryOrder } from "@/lib/seller/delivery";
import { deliveryStatusLabel } from "@/lib/seller/delivery-config";

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, lock: { current: false }, refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: hooks.refresh }) }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useRef: () => hooks.lock,
  useState: (initial: unknown) => {
    const i = hooks.cursor++;
    if (!(i in hooks.values)) hooks.values[i] = initial;
    return [hooks.values[i], (value: unknown) => { hooks.values[i] = value; }];
  },
}));
import { DeliveryControls } from "@/components/seller/delivery-controls";
const order: DeliveryOrder = { id: "one", order_code: "MLK-001", customer_name: "Buyer", phone: "0912345678", created_at: 1, total: 44000, status: "PREPARING", payment_status: "PAID", payment_method: "COD", shipping_method: "DELIVERY", address: "Address", ward: "", district: "", city: "Hanoi", delivery_assignee: "Hồng Anh", delivery_status: "WAITING", assigned_at: 1, delivery_started_at: null, delivered_at: null };
type Node = React.ReactElement<Record<string, unknown>>;
function nodes(tree: unknown): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!React.isValidElement(tree)) return [];
  const node = tree as Node;
  return [node, ...nodes(node.props.children)];
}
const render = (o = order, table = false) => { hooks.cursor = 0; return nodes(DeliveryControls({ order: o, table })); };
const action = (tree: Node[]) => tree.find(n => n.type === "button" && n.props.onClick)!;
beforeEach(() => {
  hooks.values = []; hooks.lock.current = false; hooks.refresh.mockReset();
  vi.stubGlobal("React", React);
  vi.stubGlobal("window", Object.assign(new EventTarget(), { confirm: vi.fn(() => true) }));
});
afterEach(() => vi.unstubAllGlobals());

it.each(["success", "api-error", "network-error", "invalid-json"].flatMap(outcome => [false, true].map(table => ({ outcome, table }))))("stops loading after $outcome with table=$table and reconciles server state", async ({ outcome, table }) => {
  const fetch = vi.fn(async () => {
    if (outcome === "network-error") throw new Error("Network unavailable");
    if (outcome === "invalid-json") return new Response("invalid");
    return Response.json(outcome === "api-error" ? { error: "Cần thu tiền trước." } : { success: true }, { status: outcome === "api-error" ? 409 : 200 });
  });
  vi.stubGlobal("fetch", fetch);
  const start = action(render(order, table)).props.onClick as () => void;
  start(); start();
  expect(hooks.lock.current).toBe(true);
  expect(action(render(order, table)).props.disabled).toBe(true);
  await vi.waitFor(() => expect(hooks.lock.current).toBe(false));
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(action(render(order, table)).props.disabled).toBe(false);
  expect(hooks.refresh).toHaveBeenCalledTimes(1);
  const feedback = render(order, table).find(n => n.props.role === (outcome === "success" ? "status" : "alert"));
  expect(feedback).toBeTruthy();
  if (outcome === "api-error") expect(feedback?.props.children).toBe("Cần thu tiền trước.");
});
it("pickup offers handoff without start-delivery and completed locks assignment", () => {
  const pickup = { ...order, shipping_method: "PICKUP" };
  expect(action(render(pickup)).props.children).toBe("Xác nhận đã bàn giao");
  expect(deliveryStatusLabel("WAITING", true)).toBe("Chờ khách nhận");
  expect(deliveryStatusLabel("COMPLETED", true)).toBe("Đã bàn giao");
  expect(render({ ...pickup, delivery_status: "COMPLETED" }).find(n => n.type === "select")?.props.disabled).toBe(true);
  expect(action(render({ ...pickup, delivery_status: "COMPLETED" }))).toBeUndefined();
});
it("supports inline assignment on order detail without duplicate status actions", () => {
  hooks.cursor = 0;
  const tree = nodes(DeliveryControls({ order: { ...order, delivery_assignee: null, delivery_status: "UNASSIGNED" }, assignmentOnly: true }));
  expect(tree.find(n => n.type === "select")).toBeTruthy();
  expect(tree.filter(n => n.type === "option").map(n => n.props.children)).toContain("Hồng Anh");
  expect(action(tree)).toBeUndefined();
});
it("requires confirmation before reassigning an order in delivery", () => {
  const o = { ...order, delivery_status: "IN_DELIVERY" as const, status: "SHIPPING" };
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  vi.mocked(window.confirm).mockReturnValue(false);
  const select = render(o).find(n => n.type === "select")!;
  (select.props.onChange as (e: unknown) => void)({ target: { value: "Vi Anh" } });
  (render(o).find(n => n.type === "form")!.props.onSubmit as (e: unknown) => void)({ preventDefault() {} });
  expect(window.confirm).toHaveBeenCalledWith("Đơn đang được giao. Bạn có chắc muốn đổi người phụ trách?");
  expect(fetch).not.toHaveBeenCalled();
});
