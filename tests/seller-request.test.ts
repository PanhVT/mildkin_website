import { afterEach, expect, it, vi } from "vitest";
import { sellerMutation, SELLER_REQUEST_TIMEOUT_MS } from "@/lib/seller/request";
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it.each(["headers", "body"])("times out a stalled %s and aborts the request", async stage => {
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  vi.stubGlobal("fetch", vi.fn((_url, init) => {
    signal = init.signal;
    if (stage === "headers") return new Promise(() => {});
    return Promise.resolve({ ok: true, json: () => new Promise(() => {}) });
  }));
  const pending = sellerMutation("/api/seller/orders/one/status", { status: "SHIPPING" });
  const rejected = expect(pending).rejects.toThrow("Máy chủ phản hồi quá lâu");
  await vi.advanceTimersByTimeAsync(SELLER_REQUEST_TIMEOUT_MS);
  await rejected;
  expect(signal?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
it("cleans up timeout after success and preserves backend validation messages", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ success: true })).mockResolvedValueOnce(Response.json({ error: "Vui lòng chọn người phụ trách giao đơn trước." }, { status: 409 })));
  await sellerMutation("/api/seller/orders/one/status", { status: "SHIPPING" });
  await expect(sellerMutation("/api/seller/orders/one/status", { status: "SHIPPING" })).rejects.toThrow("Vui lòng chọn người phụ trách giao đơn trước.");
  expect(vi.getTimerCount()).toBe(0);
});
