"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SellerProduct } from "@/lib/seller/data";
import { statusLabels } from "@/lib/status";
export function SellerLogin() {
  const router = useRouter();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="seller-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const data = new FormData(e.currentTarget);
        try {
          const response = await fetch("/api/seller/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(Object.fromEntries(data)),
          });
          const result = (await response.json()) as { error?: string };
          if (!response.ok) throw new Error(result.error);
          router.replace("/seller");
          router.refresh();
        } catch (error) {
          setError(
            error instanceof Error ? error.message : "Không thể đăng nhập.",
          );
          setBusy(false);
        }
      }}
    >
      <label>
        Tên đăng nhập
        <input
          name="username"
          autoComplete="username"
          required
          maxLength={100}
        />
      </label>
      <label>
        Mật khẩu
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={1024}
        />
      </label>
      <button disabled={busy}>
        {busy ? "Đang đăng nhập…" : "Đăng nhập người bán"}
      </button>
      <p role="alert">{error}</p>
    </form>
  );
}
export function SellerEdit({
  kind,
  id,
  product,
  status,
}: {
  kind: "products" | "orders";
  id: string;
  product?: SellerProduct;
  status?: string;
}) {
  const router = useRouter(),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const next: Record<string, string> = {
    PENDING_PAYMENT: "CANCELLED",
    PAID: "PREPARING",
    PREPARING: "SHIPPING",
    SHIPPING: "COMPLETED",
  };
  if (kind === "orders" && !next[status || ""]) return null;
  return (
    <form
      className="seller-form seller-edit"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMessage("");
        const form = new FormData(e.currentTarget);
        const data = product
          ? {
              price: Number(form.get("price")),
              stock: Number(form.get("stock")),
              active: form.get("active") === "on",
              expectedStock: product.stock,
              expectedPrice: product.price,
              expectedActive: Boolean(product.active),
            }
          : { status: next[status!] };
        try {
          const response = await fetch(
            `/api/seller/${kind}/${encodeURIComponent(id)}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(data),
            },
          );
          const result = (await response.json()) as { error?: string };
          if (!response.ok) throw new Error(result.error);
          setMessage("Đã lưu.");
          router.refresh();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Không thể lưu.");
        } finally {
          setBusy(false);
        }
      }}
    >
      {product ? (
        <>
          <label>
            Giá (VNĐ)
            <input
              name="price"
              type="number"
              min="1"
              max="100000000"
              step="1"
              defaultValue={product.price}
              required
            />
          </label>
          <label>
            Có thể bán (pack)
            <input
              name="stock"
              type="number"
              min="0"
              max="1000000"
              step="1"
              defaultValue={product.stock}
              required
            />
          </label>
          <label className="seller-check">
            <input
              name="active"
              type="checkbox"
              defaultChecked={Boolean(product.active)}
            />
            Đang bán
          </label>
        </>
      ) : null}
      <button disabled={busy}>
        {busy
          ? "Đang lưu…"
          : product
            ? "Lưu sản phẩm"
            : status === "PENDING_PAYMENT"
              ? "Hủy đơn chưa thanh toán"
              : `Chuyển sang ${statusLabels[next[status!]]}`}
      </button>
      <span role="status">{message}</span>
    </form>
  );
}
