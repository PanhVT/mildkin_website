export const paymentMethods = ["BANK_TRANSFER", "COD"] as const;
export type PaymentMethod = (typeof paymentMethods)[number];

export function paymentMethodLabel(method: string, shippingMethod?: string) {
  return method === "COD"
    ? shippingMethod === "PICKUP" ? "Thanh toán khi nhận bánh" : "Thanh toán khi nhận hàng"
    : "Chuyển khoản ngân hàng";
}
export function orderPaymentPath(order: { orderCode: string; paymentMethod: string }) {
  return `/orders/${order.orderCode}/${order.paymentMethod === "COD" ? "success" : "payment"}`;
}
