import { z } from "zod";
const field = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min, "Vui lòng điền đầy đủ thông tin.")
    .max(max, "Thông tin quá dài.")
    .refine((v) => !/[\u0000-\u001f]/.test(v), "Thông tin không hợp lệ.");
export const deliveryAddressSchema = z.object({
  address: field(5, 250),
  ward: field(2, 100),
  district: field(2, 100),
  city: z.literal("Hà Nội"),
});
export type DeliveryAddress = z.infer<typeof deliveryAddressSchema>;
export const customerSchema = z.object({
  shippingMethod: z.enum(["DELIVERY", "PICKUP"]),
  customerName: field(2, 100),
  phone: z
    .string()
    .trim()
    .regex(
      /^(?:0|\+84)(?:3|5|7|8|9)\d{8}$/,
      "Vui lòng nhập số di động Việt Nam hợp lệ.",
    ),
  address: field(0, 250).default(""),
  ward: field(0, 100).default(""),
  district: field(0, 100).default(""),
  city: z.literal("Hà Nội").optional(),
  note: z.string().trim().max(500, "Ghi chú tối đa 500 ký tự.").default(""),
}).superRefine((data, ctx) => {
  if (data.shippingMethod !== "DELIVERY") return;
  if (data.city !== "Hà Nội") ctx.addIssue({ code: "custom", path: ["city"], message: "Vui lòng chọn thành phố Hà Nội." });
  for (const [name, min] of [["address", 5], ["ward", 2], ["district", 2]] as const) {
    if (data[name].length < min) ctx.addIssue({ code: "custom", path: [name], message: "Vui lòng điền đầy đủ thông tin giao hàng." });
  }

});
export const cartSchema = z
  .array(
    z.object({
      productId: z.string().min(1).max(64),
      quantity: z.number().int().min(1).max(20),
    }),
  )
  .min(1)
  .max(20)
  .refine(
    (items) => new Set(items.map((i) => i.productId)).size === items.length,
    "Sản phẩm bị trùng.",
  );
export const checkoutSchema = customerSchema.safeExtend({
  items: cartSchema,
  checkoutToken: z.uuid(),
});
export type CustomerInput = z.input<typeof customerSchema>;

export type CustomerData = z.output<typeof customerSchema>;
