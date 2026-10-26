"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { SellerProduct } from "@/lib/seller/data";
import { displayPackLabel } from "@/lib/products/pack-label";
import { PRODUCT_LINES, productLine } from "@/lib/products/line";

export function ProductForm({ product }: { product?: SellerProduct }) {
  const router = useRouter();
  const [preview, setPreview] = useState(product?.image_url || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (preview.startsWith("blob:")) return () => URL.revokeObjectURL(preview);
  }, [preview]);
  return <form className="seller-form product-editor" onSubmit={async (event) => {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    form.set("active", String(form.get("active") === "on"));
    const line = PRODUCT_LINES.find(option => option.value === form.get("productLine"));
    if (!line) { setMessage("Vui lòng chọn dòng sản phẩm."); return; }
    form.set("category", line.category);
    form.set("isSpecial", String(line.isSpecial));
    form.delete("productLine");
    if (product) {
      form.set("expectedStock", String(product.stock));
      form.set("expectedUpdatedAt", String(product.updated_at));
    }
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/seller/products${product ? `/${encodeURIComponent(product.id)}` : ""}`, { method: product ? "PATCH" : "POST", body: form });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Không thể lưu sản phẩm.");
      if (!product) router.push("/seller/products");
      router.refresh(); setMessage("Đã lưu sản phẩm.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Không thể lưu sản phẩm."); }
    finally { setBusy(false); }
  }}>
    <fieldset disabled={busy}>
      {preview && <Image className="product-preview" src={preview} alt="Xem trước ảnh sản phẩm" width={240} height={240} unoptimized />}
      <label>Ảnh sản phẩm {product ? "(chọn ảnh để thay)" : "*"}<input name="image" type="file" accept="image/jpeg,image/png,image/webp" required={!product} onChange={(event) => {
        const selected = event.target.files?.[0];
        if (selected && (!["image/jpeg", "image/png", "image/webp"].includes(selected.type) || selected.size > 5 * 1024 * 1024)) {
          event.target.value = ""; setPreview(product?.image_url || ""); setMessage("Chọn ảnh JPEG, PNG hoặc WebP tối đa 5 MB."); return;
        }
        setPreview(selected ? URL.createObjectURL(selected) : product?.image_url || ""); setMessage("");
      }} /></label>
      <small>JPEG, PNG, WebP · Tối đa 5 MB</small>
      <label>Tên sản phẩm *<input name="name" required maxLength={100} defaultValue={product?.name} /></label>
      <label>Mô tả *<textarea name="description" required maxLength={2000} rows={4} defaultValue={product?.description} /></label>
      <label>Số bánh trong mỗi gói *<input name="units_per_pack" type="number" required min={1} max={10000} step={1} defaultValue={product?.units_per_pack ?? 1} /></label>
      <small>Dùng để tính số bánh cần làm. Hãy kiểm tra giá trị này; quy cách bên dưới chỉ là nhãn hiển thị cho khách.</small>
      <label>Quy cách<input name="pack_label" maxLength={50} placeholder="Ví dụ: 3 cookies / pack" defaultValue={displayPackLabel(product?.pack_label)} /></label>
      <small>Để trống sẽ dùng nhãn mặc định: 3 cookies / pack.</small>
      <label>Giá (VNĐ) *<input name="price" type="number" required min={1} max={100000000} step={1} defaultValue={product?.price} /></label>
      <label>Tồn kho có thể bán (pack) *<input name="stock" type="number" required min={0} max={1000000} step={1} defaultValue={product?.stock ?? 0} /></label>
      <label>Dòng sản phẩm<select name="productLine" defaultValue={productLine(product?.category || "COOKIE", Boolean(product?.is_special))}>
        {PRODUCT_LINES.map(line => <option key={line.value} value={line.value}>{line.label}</option>)}
      </select></label>
      <label className="seller-check"><input name="active" type="checkbox" defaultChecked={product ? Boolean(product.active) : true} /> Đang bán</label>
      <button disabled={busy}>{busy ? "Đang lưu…" : "Lưu sản phẩm"}</button>
    </fieldset>
    <p role="status" aria-live="polite">{message}</p>
  </form>;
}
