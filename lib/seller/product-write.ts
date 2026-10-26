import { z } from "zod";
import type { Env } from "@/lib/env";
import { PublicError } from "@/lib/http";
import { packLabelSchema, unitsPerPackSchema } from "./product-validation";
import { DEFAULT_PACK_LABEL } from "@/lib/products/pack-label";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const imageKeyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/;
const fields = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(2000),
  pack_label: packLabelSchema.optional(),
  units_per_pack: unitsPerPackSchema.optional(),
  price: z.number().int().positive().max(100000000),
  stock: z.number().int().min(0).max(1000000),
  category: z.enum(["COOKIE", "CHUNKY"]),
  active: z.boolean(),
  isSpecial: z.boolean(),
  expectedStock: z.number().int().min(0).optional(),
  expectedUpdatedAt: z.number().int().optional(),
});

export async function validateImage(file: File) {
  if (!file.size || file.size > MAX_IMAGE_BYTES) throw new PublicError("Ảnh phải nhỏ hơn hoặc bằng 5 MB.", 400);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  const type = file.type;
  const valid = (type === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    || (type === "image/png" && bytes.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10")
    || (type === "image/webp" && text(0, 4) === "RIFF" && text(8, 12) === "WEBP");
  if (!valid) throw new PublicError("Vui lòng chọn ảnh JPEG, PNG hoặc WebP hợp lệ.");
  return { bytes, extension: type === "image/jpeg" ? "jpg" : type === "image/png" ? "png" : "webp" };
}

async function boundedForm(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) throw new PublicError("Dữ liệu không hợp lệ.");
  const reader = request.body?.getReader();
  if (!reader) throw new PublicError("Thiếu dữ liệu.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_IMAGE_BYTES + 32768) {
      await reader.cancel();
      throw new PublicError("Dữ liệu quá lớn. Ảnh tối đa 5 MB.", 413);
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  try { return await new Response(body, { headers: { "Content-Type": request.headers.get("content-type")! } }).formData(); }
  catch { throw new PublicError("Dữ liệu tải lên không hợp lệ."); }
}

export async function writeProduct(request: Request, env: Env, id?: string) {
  const form = await boundedForm(request);
  const numeric = (key: string) => {
    const value = form.get(key);
    return typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  };
  const parsed = fields.safeParse({
    name: form.get("name"), description: form.get("description"),
    pack_label: form.get("pack_label") ?? undefined,
    units_per_pack: form.has("units_per_pack") ? numeric("units_per_pack") : undefined,
    price: numeric("price"), stock: numeric("stock"), category: form.get("category"),
    active: form.get("active") === "true", isSpecial: form.get("isSpecial") === "true",
    ...(id ? { expectedStock: numeric("expectedStock"), expectedUpdatedAt: numeric("expectedUpdatedAt") } : {}),
  });
  if (!parsed.success && parsed.error.issues.some((issue) => issue.path[0] === "pack_label"))
    throw new PublicError("Quy cách chỉ nhận văn bản thuần, tối đa 50 ký tự; không nhập HTML.");
  if (!parsed.success && parsed.error.issues.some((issue) => issue.path[0] === "units_per_pack"))
    throw new PublicError("Số bánh trong mỗi gói phải là số nguyên từ 1 đến 10000.");
  if (parsed.success && parsed.data.category === "CHUNKY" && parsed.data.isSpecial)
    throw new PublicError("Chunky Cookies là dòng riêng; Special chỉ áp dụng cho Mildkin Signature.");
  if (!parsed.success || !["true", "false"].includes(String(form.get("active"))) || !["true", "false"].includes(String(form.get("isSpecial")))) throw new PublicError("Thông tin sản phẩm không hợp lệ. Kiểm tra tên, mô tả, giá và tồn kho.");
  const p = parsed.data;
  const previous = id ? await env.DB.prepare("SELECT image_url FROM products WHERE id=?").bind(id).first<{ image_url: string }>() : null;
  if (id && !previous) throw new PublicError("Không tìm thấy sản phẩm.", 404);
  const file = form.get("image");
  const upload = file instanceof File && file.size > 0 ? file : null;
  if (!id && !upload) throw new PublicError("Vui lòng chọn ảnh sản phẩm.");
  let key: string | undefined;
  let imageUrl = previous?.image_url;
  if (upload) {
    const { bytes, extension } = await validateImage(upload);
    key = `${crypto.randomUUID()}.${extension}`;
    await env.PRODUCT_IMAGES.put(key, bytes, { httpMetadata: { contentType: upload.type } });
    imageUrl = `/api/product-images/${key}`;
  }
  const productId = id || crypto.randomUUID();
  try {
    if (id) {
      const result = await env.DB.prepare("UPDATE products SET name=?,description=?,pack_label=COALESCE(?,pack_label),units_per_pack=COALESCE(?,units_per_pack),price=?,stock=?,category=?,active=?,is_special=?,image_url=?,updated_at=? WHERE id=? AND stock=? AND updated_at=?")
        .bind(p.name, p.description, p.pack_label ?? null, p.units_per_pack ?? null, p.price, p.stock, p.category, Number(p.active), Number(p.isSpecial), imageUrl!, Math.max(Date.now(), p.expectedUpdatedAt! + 1), id, p.expectedStock!, p.expectedUpdatedAt!).run();
      if (!result.meta.changes) throw new PublicError("Sản phẩm hoặc tồn kho đã thay đổi. Tải lại trang rồi thử lại.", 409);
    } else {
      const base = p.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100) || "cookie";
      // A UUID suffix also avoids concurrent same-name creation races.
      const slug = `${base}-${productId}`;
      await env.DB.prepare("INSERT INTO products (id,slug,name,description,pack_label,units_per_pack,price,stock,category,active,is_special,image_url,flavor,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'original',?,?)")
        .bind(productId, slug, p.name, p.description, p.pack_label ?? DEFAULT_PACK_LABEL, p.units_per_pack ?? 1, p.price, p.stock, p.category, Number(p.active), Number(p.isSpecial), imageUrl!, Date.now(), Date.now()).run();
    }
  } catch (error) {
    if (key) await env.PRODUCT_IMAGES.delete(key).catch(() => console.error("Product image cleanup failed"));
    throw error;
  }
  // Cleanup failure must not turn a committed write into a failed response.
  const oldKey = previous?.image_url.replace(/^\/api\/product-images\//, "");
  if (key && oldKey && imageKeyPattern.test(oldKey)) await env.PRODUCT_IMAGES.delete(oldKey).catch(() => console.error("Old product image cleanup failed"));
  return { success: true, id: productId };
}
