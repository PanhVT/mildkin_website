import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ order: vi.fn(), qr: vi.fn(), bank: vi.fn() }));
vi.mock("@/lib/orders/access", () => ({ requireOrder: mocks.order }));
vi.mock("@/lib/payments/sepay/createQRUrl", () => ({ createQRUrl: mocks.qr }));
vi.mock("@/lib/payments/sepay/banks", () => ({ getBank: mocks.bank }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
import PaymentPage from "@/app/orders/[orderCode]/payment/page";
import SuccessPage from "@/app/orders/[orderCode]/success/page";
import { OrderHistory } from "@/components/auth/order-history";
import { PaymentOptions } from "@/components/checkout/payment-options";
import { paymentMethodLabel } from "@/lib/payments/method";
const order = {
  orderCode: "MK0000000001", customerName: "Test buyer", paymentMethod: "COD", paymentStatus: "PENDING", status: "PREPARING",
  shippingMethod: "DELIVERY", shippingFee: 10000, deliveryDistanceMeters: 3200, subtotal: 44000, total: 54000,
  bankCode: "VCB", bankAccount: "123456789", accountHolder: "TEST BANK HOLDER", expiresAt: 9999999999999,
  address: "Test address", ward: "Test ward", city: "Hà Nội",
};
const props = { params: Promise.resolve({ orderCode: order.orderCode }) };
beforeEach(() => {
  vi.stubGlobal("React", React);
  mocks.order.mockReset().mockResolvedValue({ ...order });
  mocks.qr.mockReset().mockReturnValue("https://qr.example/test.png");
  mocks.bank.mockReset().mockReturnValue({ name: "Test bank" });
});
describe("COD buyer payment pages", () => {
  it("redirects COD away from payment before generating QR or bank instructions", async () => {
    await expect(PaymentPage(props)).rejects.toThrow(`REDIRECT:/orders/${order.orderCode}/success`);
    expect(mocks.qr).not.toHaveBeenCalled();
    expect(mocks.bank).not.toHaveBeenCalled();
  });
  it("renders unpaid COD confirmation with total, fee and method but no transfer details", async () => {
    const html = renderToStaticMarkup(await SuccessPage(props));
    expect(html).toContain("Đặt bánh thành công ♡");
    expect(html).toContain("Bạn sẽ thanh toán khi nhận bánh");
    expect(html).toContain("Thanh toán khi nhận hàng");
    expect(html).toContain(order.orderCode);
    expect(html).toMatch(/54[.,]000/);
    expect(html).toMatch(/10[.,]000/);
    expect(html).not.toMatch(/123456789|TEST BANK HOLDER|SePay|qr\.example|đã nhận được/);
  });
  it("uses pickup wording and renders collected COD as paid", async () => {
    mocks.order.mockResolvedValue({ ...order, shippingMethod: "PICKUP", paymentStatus: "PAID" });
    const html = renderToStaticMarkup(await SuccessPage(props));
    expect(html).toContain("Thanh toán khi nhận bánh");
    expect(html).toContain("Thanh toán thành công");
    expect(html).not.toContain("Bạn chưa cần thanh toán ngay");
    expect(paymentMethodLabel("COD", "PICKUP")).toBe("Thanh toán khi nhận bánh");
  });
  it("does not show a success or collection request for cancelled COD", async () => {
    mocks.order.mockResolvedValue({ ...order, status: "CANCELLED" });
    const html = renderToStaticMarkup(await SuccessPage(props));
    expect(html).toContain("Đơn bánh đã hủy");
    expect(html).not.toContain("Đặt bánh thành công");
    expect(html).not.toContain("Mildkin sẽ thu tiền");
  });
  it("retains SePay QR and unpaid transfer redirect behavior", async () => {
    mocks.order.mockResolvedValue({ ...order, paymentMethod: "BANK_TRANSFER", status: "PENDING_PAYMENT" });
    await PaymentPage(props);
    expect(mocks.qr).toHaveBeenCalledWith("VCB", "123456789", 54000, order.orderCode);
    await expect(SuccessPage(props)).rejects.toThrow(`REDIRECT:/orders/${order.orderCode}/payment`);
  });
  it("shows payment method/status in account order history", () => {
    const html = renderToStaticMarkup(React.createElement(OrderHistory, { rows: [{ orderCode: order.orderCode, paymentMethod: "COD", paymentStatus: "PENDING", status: "PREPARING", shippingMethod: "PICKUP", total: 44000, createdAt: 1 }] }));
    expect(html).toContain("Thanh toán khi nhận bánh");
    expect(html).toContain("Chưa thanh toán");
  });
  it.each(["COD", "BANK_TRANSFER"])("labels new %s orders according to the payment method", paymentMethod => {
    const html = renderToStaticMarkup(React.createElement(OrderHistory, { rows: [{ orderCode: order.orderCode, paymentMethod: paymentMethod as "COD" | "BANK_TRANSFER", paymentStatus: "PENDING", status: "PENDING_PAYMENT", shippingMethod: "PICKUP", total: 44000, createdAt: 1 }] }));
    expect(html).toContain(paymentMethod === "COD" ? "Chờ xác nhận" : "Chờ thanh toán");
    expect(html).not.toContain("Đã xác nhận");
  });
  it("renders two accessible payment radios with selected COD and pickup text", () => {
    const html = renderToStaticMarkup(React.createElement(PaymentOptions, { method: "COD", shippingMethod: "PICKUP", disabled: false, onChange: () => {} }));
    expect(html.match(/type="radio"/g)).toHaveLength(2);
    expect(html).toContain("Chuyển khoản ngân hàng");
    expect(html).toContain("Thanh toán khi nhận bánh");
    expect(html).toMatch(/checked=""[^>]*value="COD"|value="COD"[^>]*checked=""/);
  });
});
