import { describe, expect, it } from "vitest";
import { formatCurrency } from "@/lib/currency";
import { calculateOrderTotal } from "@/lib/orders/calculateOrder";
import { generateOrderCode } from "@/lib/orders/generateOrderCode";
import { extractOrderCode } from "@/lib/payments/sepay/extractOrderCode";
import { createQRUrl } from "@/lib/payments/sepay/createQRUrl";
import { paymentAmountMatching } from "@/lib/payments/sepay/payload";
import { verifyWebhook } from "@/lib/payments/sepay/verifyWebhook";
import { checkoutSchema } from "@/lib/validation";
describe("order helpers", () => {
  it("formats VND", () => expect(formatCurrency(22000)).toBe("22.000đ"));
  it("generates random, strict, distinct codes", () => {
    const values = new Set(Array.from({ length: 1000 }, generateOrderCode));
    expect(values.size).toBe(1000);
    for (const code of values) expect(code).toMatch(/^MK[A-F0-9]{10}$/);
  });
  it("calculates integer totals", () =>
    expect(
      calculateOrderTotal(
        [
          { price: 22000, quantity: 2 },
          { price: 24000, quantity: 1 },
        ],
        25000,
      ),
    ).toEqual({ subtotal: 68000, shippingFee: 25000, total: 93000 }));
  it("rejects bad quantity and fractional price", () => {
    expect(() =>
      calculateOrderTotal([{ price: 22000, quantity: -1 }], 0),
    ).toThrow();
    expect(() =>
      calculateOrderTotal([{ price: 1.2, quantity: 1 }], 0),
    ).toThrow();
  });
  it("extracts only one exact Mildkin code", () => {
    expect(extractOrderCode("Thanh toan MK123ABC4567 cam on")).toBe(
      "MK123ABC4567",
    );
    for (const invalid of [
      "XMK123ABC4567",
      "MK123ABC4567Z",
      "MK123",
      "MK123ABC4567 MK0000000000",
    ])
      expect(extractOrderCode(invalid)).toBeNull();
  });
  it("builds the QR parameters safely", () => {
    const url = new URL(
      createQRUrl("vietcombank", "123456789", 47000, "MK123ABC4567"),
    );
    expect(url.origin).toBe("https://qr.sepay.vn");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      bank: "VCB",
      acc: "123456789",
      amount: "47000",
      des: "MK123ABC4567",
    });
    expect(() => createQRUrl("fake", "123456789", 1, "MK123ABC4567")).toThrow();
  });
  it("only accepts exact payment amount", () => {
    expect(paymentAmountMatching(47000, 47000)).toBe(true);
    expect(paymentAmountMatching(46999, 47000)).toBe(false);
    expect(paymentAmountMatching(47001, 47000)).toBe(false);
    expect(paymentAmountMatching(0, 0)).toBe(false);
  });
  it("validates Vietnamese phone and rejects duplicate product IDs", () => {
    const valid = {
      customerName: "Nguyễn An",
      phone: "+84912345678",
      address: "12 đường thử",
      ward: "Phường thử",
      district: "Khu vực thử",
      city: "Hà Nội",
      shippingMethod: "PICKUP",
      checkoutToken: crypto.randomUUID(),
      items: [{ productId: "a", quantity: 1 }],
    };
    expect(checkoutSchema.safeParse(valid).success).toBe(true);
    expect(checkoutSchema.safeParse({ ...valid, phone: "1234" }).success).toBe(
      false,
    );
    expect(
      checkoutSchema.safeParse({
        ...valid,
        items: [...valid.items, ...valid.items],
      }).success,
    ).toBe(false);
  });
});
describe("HMAC authentication", () => {
  it("verifies the exact raw body and rejects stale/replayed/tampered requests", async () => {
    const secret = "test-only-secret-32-characters-long";
    const now = Date.now();
    const timestamp = String(Math.floor(now / 1000));
    const raw = '{"id":1}';
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = Array.from(
      new Uint8Array(
        await crypto.subtle.sign(
          "HMAC",
          key,
          new TextEncoder().encode(`${timestamp}.${raw}`),
        ),
      ),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
    const headers = new Headers({
      "x-sepay-timestamp": timestamp,
      "x-sepay-signature": `sha256=${signature}`,
    });
    expect(await verifyWebhook(headers, raw, secret, "hmac", now)).toBe(true);
    expect(await verifyWebhook(headers, '{"id":2}', secret, "hmac", now)).toBe(
      false,
    );
    expect(
      await verifyWebhook(headers, raw, secret, "hmac", now + 301000),
    ).toBe(false);
    expect(await verifyWebhook(headers, raw, "", "hmac", now)).toBe(false);
  });
});
