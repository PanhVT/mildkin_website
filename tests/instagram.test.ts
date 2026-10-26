import { describe, expect, it } from "vitest";
import { instagramSchema, instagramProfileUrl } from "@/lib/instagram";
import { customerSchema } from "@/lib/validation";
import { confirmationMessage, canCopyConfirmation } from "@/lib/seller/instagram";
import type { SellerOrder } from "@/lib/seller/data";

describe("Instagram checkout", () => {
  it.each([ [" @PhuongAnh ", "phuonganh"], ["phuonganh", "phuonganh"], ["phuong.anh_03", "phuong.anh_03"], ["https://instagram.com/PhuongAnh/", "phuonganh"] ])("normalizes %s", (value, expected) => expect(instagramSchema.parse(value)).toBe(expected));
  it.each([undefined, "", " ", "@", "two words", "a/b", "a".repeat(31), "a..b", ".name", "name.", "https://evil.test/name", "https://instagram.com/name/extra", "https://instagram.com.evil.test/name", "<script>"])("rejects %s", value => expect(instagramSchema.safeParse(value).success).toBe(false));
  it("requires Instagram at checkout", () => {
    const input = { customerName: "Buyer", phone: "0912345678", shippingMethod: "PICKUP" };
    expect(customerSchema.safeParse(input).success).toBe(false);
    expect(customerSchema.parse({ ...input, customerInstagram: "@Buyer" }).customerInstagram).toBe("buyer");
  });
  it("builds sanitized profile URLs", () => {
    expect(instagramProfileUrl("@PhuongAnh")).toBe("https://www.instagram.com/phuonganh/");
    expect(instagramProfileUrl("javascript:alert(1)")).toBeNull();
    expect(instagramProfileUrl(null)).toBeNull();
  });
});
const order: SellerOrder = { id: "test", order_code: "MK1234567890", customer_name: "Phương Anh", phone: "0912345678", customer_instagram: "phuonganh", instagram_contacted_at: null, created_at: 1, total: 75000, status: "PREPARING", payment_status: "PENDING", payment_method: "COD", shipping_method: "DELIVERY" };
const items = [{ product_name_snapshot: "Classic Cookie", quantity: 2 }, { product_name_snapshot: "Matcha Oreo", quantity: 1 }];
describe("confirmation messages", () => {
  it("uses real snapshots, total and unpaid COD wording", () => {
    const text = confirmationMessage(order, items);
    for (const part of ["Phương Anh", "MK1234567890", "Classic Cookie × 2", "Matcha Oreo × 1", "75.000đ", "Giao tận nơi", "Thanh toán khi nhận hàng"]) expect(text).toContain(part);
    expect(text).not.toContain("Đã thanh toán");
  });
  it("uses paid bank transfer and pickup wording", () => {
    const text = confirmationMessage({ ...order, payment_method: "BANK_TRANSFER", payment_status: "PAID", shipping_method: "PICKUP" }, items);
    expect(text).toContain("Đã thanh toán"); expect(text).toContain("Nhận bánh tại NEU");
  });
  it.each(["PENDING_PAYMENT", "PAID", "CANCELLED"])("blocks unconfirmed/cancelled %s", status => {
    expect(canCopyConfirmation({ ...order, status })).toBe(false);
    expect(() => confirmationMessage({ ...order, status }, items)).toThrow("Đơn chưa được xác nhận");
  });
  it("blocks unpaid bank transfer even if its stage is preparing", () => expect(canCopyConfirmation({ ...order, payment_method: "BANK_TRANSFER" })).toBe(false));
  it("describes later stages accurately", () => {
    expect(confirmationMessage({ ...order, status: "SHIPPING" }, items)).toContain("đang được giao");
    expect(confirmationMessage({ ...order, status: "COMPLETED" }, items)).toContain("đã hoàn thành");
  });
});
