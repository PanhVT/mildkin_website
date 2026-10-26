import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, lock: { current: false }, refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: hooks.refresh }) }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(), useEffect: () => {}, useRef: () => hooks.lock,
  useState: (initial: unknown) => { const i = hooks.cursor++; if (!(i in hooks.values)) hooks.values[i] = initial; return [hooks.values[i], (value: unknown) => { hooks.values[i] = value; }]; },
}));
import { InstagramContact } from "@/components/seller/instagram-contact";
type Node = React.ReactElement<Record<string, unknown>>;
function nodes(tree: unknown): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!React.isValidElement(tree)) return [];
  const node = tree as Node; return [node, ...nodes(node.props.children)];
}
function render(confirmed = true, username: string | null = "buyer") {
  hooks.cursor = 0; return nodes(InstagramContact({ id: "one", username, contactedAt: null, confirmed }));
}
const button = (label: string) => render().find(n => n.type === "button" && n.props.children === label)!;
beforeEach(() => {
  hooks.values = []; hooks.cursor = 0; hooks.lock.current = false; hooks.refresh.mockReset(); vi.stubGlobal("React", React);
  vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(async () => {}) } });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ message: "DB message", instagram_contacted_at: 1792020000000 })));
});
afterEach(() => vi.unstubAllGlobals());
it("opens a safe profile in a new tab without a write handler", () => {
  const link = render().find(n => n.type === "a")!;
  expect(link.props.href).toBe("https://www.instagram.com/buyer/"); expect(link.props.target).toBe("_blank"); expect(link.props.rel).toBe("noopener noreferrer"); expect(link.props.onClick).toBeUndefined(); expect(fetch).not.toHaveBeenCalled();
});
it("copies the server message without marking contact or refreshing", async () => {
  (button("Sao chép tin nhắn xác nhận").props.onClick as () => void)();
  await vi.waitFor(() => expect(hooks.lock.current).toBe(false));
  expect(fetch).toHaveBeenCalledTimes(1); expect(fetch).toHaveBeenCalledWith("/api/seller/orders/one/instagram-message", expect.objectContaining({ method: "GET" }));
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith("DB message"); expect(hooks.refresh).not.toHaveBeenCalled();
  expect(render().find(n => n.props.role === "status")?.props.children).toBe("Đã sao chép tin nhắn xác nhận");
  expect(button("Đánh dấu đã liên hệ")).toBeTruthy();
});
it("updates contact immediately from the server and supports undo", async () => {
  (button("Đánh dấu đã liên hệ").props.onClick as () => void)();
  await vi.waitFor(() => expect(hooks.lock.current).toBe(false));
  expect(button("Bỏ đánh dấu")).toBeTruthy(); expect(hooks.refresh).toHaveBeenCalledTimes(1);
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({ instagram_contacted_at: null }));
  (button("Bỏ đánh dấu").props.onClick as () => void)();
  await vi.waitFor(() => expect(hooks.lock.current).toBe(false));
  expect(button("Đánh dấu đã liên hệ")).toBeTruthy();
  expect(fetch).toHaveBeenLastCalledWith("/api/seller/orders/one/instagram-contact", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ contacted: false }) }));
});
it("disables confirmation for waiting orders and handles legacy orders", () => {
  expect(render(false).find(n => n.type === "button" && n.props.children === "Sao chép tin nhắn xác nhận")?.props.disabled).toBe(true);
  expect(render(true, null).find(n => n.type === "a")).toBeUndefined();
});
it("shows a friendly clipboard error without marking", async () => {
  vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error("denied"));
  (button("Sao chép tin nhắn xác nhận").props.onClick as () => void)();
  await vi.waitFor(() => expect(hooks.lock.current).toBe(false));
  expect(render().find(n => n.props.role === "alert")?.props.children).toContain("Chưa sao chép được"); expect(fetch).toHaveBeenCalledTimes(1);
});
