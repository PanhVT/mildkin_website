import { z } from "zod";
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Email chưa hợp lệ.")
  .max(254);
export const profileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Tên cần ít nhất 2 ký tự.")
    .max(100)
    .refine((v) => !/[\u0000-\u001f]/.test(v), "Tên chưa hợp lệ."),
  phone: z
    .string()
    .trim()
    .max(12)
    .refine(
      (v) => !v || /^(?:0|\+84)(?:3|5|7|8|9)\d{8}$/.test(v),
      "Vui lòng nhập số di động Việt Nam hợp lệ.",
    ),
});
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export const registerSchema = profileSchema
  .extend({
    phone: profileSchema.shape.phone.default(""),
    email: emailSchema,
    password: z
      .string()
      .min(8, "Mật khẩu cần ít nhất 8 ký tự.")
      .max(128, "Mật khẩu tối đa 128 ký tự.")
      .regex(/[\p{L}]/u, "Mật khẩu cần ít nhất một chữ.")
      .regex(/\d/, "Mật khẩu cần ít nhất một số."),
    confirmPassword: z.string().max(128),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Mật khẩu nhập lại chưa khớp.",
    path: ["confirmPassword"],
  });
// An allowlist prevents external URLs, protocol-relative URLs and encoded redirects.
export function safeNext(value: unknown) {
  if (typeof value !== "string") return "/account";
  if (["/account", "/account/orders", "/checkout"].includes(value))
    return value;
  return /^\/account\/orders\/MK[A-F0-9]{10}$/.test(value) ? value : "/account";
}
