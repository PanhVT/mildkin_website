import { z } from "zod";

export const instagramError = "Vui lòng nhập tên Instagram hợp lệ.";
export function normalizeInstagram(input: string) {
  let value = input.trim();
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      if (!["instagram.com", "www.instagram.com"].includes(url.hostname.toLowerCase()) || url.username || url.password) return "";
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length !== 1) return "";
      value = parts[0];
    } catch { return ""; }
  }
  return value.replace(/^@/, "").toLowerCase();
}
export const instagramSchema = z.string({ error: instagramError }).transform(normalizeInstagram)
  .pipe(z.string().regex(/^(?!.*\.\.)(?!\.)(?!.*\.$)[a-z0-9._]{1,30}$/, instagramError));
export function instagramProfileUrl(value: string | null) {
  const parsed = instagramSchema.safeParse(value);
  return parsed.success ? `https://www.instagram.com/${parsed.data}/` : null;
}
