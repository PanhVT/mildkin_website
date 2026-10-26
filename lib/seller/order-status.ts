// Existing database values: PAID is the legacy confirmed order stage.
export const orderStatusLabels: Record<string, string> = {
  PENDING_PAYMENT: "Chờ xác nhận / thanh toán",
  PAID: "Chờ chuẩn bị (đơn cũ)",
  PREPARING: "Đang chuẩn bị",
  SHIPPING: "Đang giao",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã hủy",
};
export interface OrderState {
  delivery_assignee?: string | null;
  status: string;
  shipping_method: string;
  payment_method: string;
  payment_status: string;
}
export function orderStatusLabel(status: string, paymentMethod?: string) {
  if (status === "PENDING_PAYMENT" && paymentMethod)
    return paymentMethod === "COD" ? "Chờ xác nhận" : "Chờ thanh toán";
  return orderStatusLabels[status] || status;
}
export function allowedOrderTransitions(o: OrderState): string[] {
  const cancel = o.payment_status === "PENDING" ? ["CANCELLED"] : [];
  switch (o.status) {
    case "PENDING_PAYMENT": return [
      ...(o.payment_method === "COD" && o.payment_status === "PENDING" ? ["PREPARING"] : []), ...cancel,
    ];
    case "PAID": return ["PREPARING"];
    case "PREPARING": return [
      ...(o.shipping_method === "PICKUP"
        ? (o.payment_status === "PAID" ? ["COMPLETED"] : [])
        : ["SHIPPING"]), ...cancel,
    ];
    case "SHIPPING": return [...(o.payment_status === "PAID" ? ["COMPLETED"] : []), ...cancel];
    default: return [];
  }
}
