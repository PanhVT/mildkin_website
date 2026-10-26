import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SELLER_REQUEST_TIMEOUT_MS } from "@/lib/seller/request";
const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, lock: { current: false }, refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: hooks.refresh }) }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useEffect: () => {},
  useRef: (value: unknown) => value === false ? hooks.lock : { current: null },
  useState: (initial: unknown) => {
    const i = hooks.cursor++;
    if (!(i in hooks.values)) hooks.values[i] = initial;
    return [hooks.values[i], (value: unknown) => { hooks.values[i] = value; }];
  },
}));
import { OrderStatusControls } from "@/components/seller/order-status-controls";
type Node = React.ReactElement<Record<string, unknown>>;
function nodes(tree: unknown): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!React.isValidElement(tree)) return [];
  const node = tree as Node;
  return [node, ...nodes(node.props.children)];
}
function render() {
  hooks.cursor = 0;
  return nodes(OrderStatusControls({ id: "one", order: { status: "PREPARING", shipping_method: "DELIVERY", payment_method: "COD", payment_status: "PENDING", delivery_assignee: "Hồng Anh" } }));
}
beforeEach(() => {
  vi.useFakeTimers(); hooks.values = []; hooks.lock.current = false; hooks.refresh.mockReset();
  vi.stubGlobal("React", React);
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it.each(["status", "payment-status"])("releases loading for stalled %s writes and refreshes potentially committed data", async kind => {
  vi.stubGlobal("FormData", class { get() { return kind === "status" ? "SHIPPING" : "PAID"; } });
  const form = render().filter(n => n.type === "form")[kind === "status" ? 0 : 1];
  (form.props.onSubmit as (e: unknown) => void)({ preventDefault() {}, currentTarget: {} });
  if (kind === "payment-status") {
    const confirm = render().find(n => n.type === "button" && n.props.children === "Xác nhận")!;
    (confirm.props.onClick as () => void)();
  }
  expect(hooks.lock.current).toBe(true);
  expect(render().filter(n => n.type === "button").every(n => n.props.disabled)).toBe(true);
  await vi.advanceTimersByTimeAsync(SELLER_REQUEST_TIMEOUT_MS);
  expect(hooks.lock.current).toBe(false);
  expect(render().find(n => n.props.role === "status")?.props.children).toContain("Máy chủ phản hồi quá lâu");
  expect(render().find(n => n.type === "button" && n.props.children === "Lưu trạng thái đơn hàng")?.props.disabled).toBe(false);
  expect(hooks.refresh).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
