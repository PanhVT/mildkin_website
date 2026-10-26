export const DELIVERY_ASSIGNEES = ["Hồng Anh", "Thuỳ Anh", "Phương Anh", "Vi Anh", "Thái Thư", "Ngô Thư", "Hoàng Hà"] as const;
export const DELIVERY_STATUSES = ["UNASSIGNED", "WAITING", "IN_DELIVERY", "COMPLETED"] as const;
export type DeliveryStatus = typeof DELIVERY_STATUSES[number];
export function deliveryStatusLabel(status: string, pickup = false) {
  return ({ UNASSIGNED: "Chưa phân công", WAITING: pickup ? "Chờ khách nhận" : "Chờ giao", IN_DELIVERY: "Đang giao", COMPLETED: pickup ? "Đã bàn giao" : "Đã giao" } as Record<string, string>)[status] || status;
}
