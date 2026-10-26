import { beforeEach, expect, it, vi } from "vitest";
import { PublicError } from "@/lib/http";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), first: vi.fn(), update: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.auth }));
vi.mock("@/lib/env", () => ({ getEnv: async () => ({ SITE_URL: "https://test.example", DB: { prepare: () => ({ bind: () => ({ first: mocks.first }) }) } }) }));
vi.mock("@/lib/seller/data", () => ({ updateSellerOrder: mocks.update }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { PATCH } from "@/app/api/admin/orders/[orderCode]/route";
const call = () => PATCH(new Request("https://test.example/api/admin/orders/MLK", { method: "PATCH", headers: { Origin: "https://test.example", "Content-Type": "application/json" }, body: JSON.stringify({ status: "SHIPPING" }) }), { params: Promise.resolve({ orderCode: "MLK" }) });
beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.mockResolvedValue(undefined);
  mocks.first.mockResolvedValue({ id: "order", payment_status: "PAID" });
  mocks.update.mockResolvedValue({ success: true });
});
it("uses the shared delivery guard and sync instead of bypassing assignment", async () => {
  mocks.update.mockRejectedValue(new PublicError("Vui lòng chọn người phụ trách giao đơn trước.", 409));
  const response = await call();
  expect(response.status).toBe(409);
  expect(mocks.update).toHaveBeenCalledWith(expect.anything(), "order", { status: "SHIPPING" });
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
it("retains admin authentication and paid-only restriction", async () => {
  mocks.auth.mockRejectedValueOnce(new PublicError("Unauthorized", 401));
  expect((await call()).status).toBe(401);
  expect(mocks.first).not.toHaveBeenCalled();
  mocks.first.mockResolvedValue({ id: "order", payment_status: "PENDING" });
  expect((await call()).status).toBe(409);
  expect(mocks.update).not.toHaveBeenCalled();
});
it("revalidates seller and buyer views after a successful admin write", async () => {
  expect((await call()).status).toBe(200);
  expect(mocks.revalidate).toHaveBeenCalledWith("/seller", "layout");
  expect(mocks.revalidate).toHaveBeenCalledWith("/account/orders", "layout");
});
