"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LockKeyhole, ArrowRight } from "lucide-react";
import { customerSchema, type DeliveryAddress, type CustomerInput, type CustomerData } from "@/lib/validation";
import { useCart } from "@/components/cart/cart-provider";
import { formatCurrency } from "@/lib/currency";
import type { Product } from "@/db/schema";
import { ShippingOptions } from "./shipping-options";
import { addressQuoteKey, usableAddressQuote, type AddressQuote } from "@/lib/shipping-quote-state";
import type { ShippingMethod } from "@/lib/shipping";
export function CheckoutForm({
  products,
  customer,
}: {
  products: Product[];
  customer?: { name: string; phone: string };
}) {
  const { items, ready, clear } = useCart();
  const router = useRouter();
  const [error, setError] = useState("");
  const [quote, setQuote] = useState<AddressQuote | null>(null);
  const quoteRequest = useRef(0);
  const [quoteVersion, setQuoteVersion] = useState(0);
  const attempt = useRef<string | null>(null);
  const submitting = useRef(false);
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CustomerInput, unknown, CustomerData>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      shippingMethod: "DELIVERY",
      address: "",
      ward: "",
      district: "",
      city: "Hà Nội",
      note: "",
      customerName: customer?.name || "",
      phone: customer?.phone || "",
    },
  });
  const shippingMethod = useWatch({ control, name: "shippingMethod" });
  const addressFields = useWatch({ control, name: ["address", "ward", "district", "city"] });
  const deliveryAddress: DeliveryAddress = { address: addressFields[0] || "", ward: addressFields[1] || "", district: addressFields[2] || "", city: addressFields[3] || "Hà Nội" };
  const currentQuote = usableAddressQuote(quote, deliveryAddress);
  const shippingFee = shippingMethod === "PICKUP" ? 0 : currentQuote?.available ? currentQuote.fee : null;
  function resetQuote() {
    quoteRequest.current += 1;
    setQuoteVersion(quoteRequest.current);
    setQuote(null);
  }
  function selectMethod(method: ShippingMethod) {
    resetQuote();
    setValue("shippingMethod", method);
    setError("");
  }
  const lines = items.map((i) => ({
    ...i,
    product: products.find((p) => p.id === i.productId),
  }));
  const subtotal = lines.reduce(
    (sum, item) => sum + (item.product?.price || 0) * item.quantity,
    0,
  );
  const invalid = lines.some((i) => !i.product || i.product.stock < i.quantity);
  async function submit(customer: CustomerInput) {
    if (submitting.current || shippingFee === null) return;
    submitting.current = true;
    setError("");
    attempt.current ||= crypto.randomUUID();
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...customer,
          items,
          checkoutToken: attempt.current,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        orderCode: string;
      };
      if (!response.ok)
        throw new Error(data.error || "Chưa tạo được đơn. Vui lòng thử lại.");
      clear();
      router.push(`/orders/${data.orderCode}/payment`);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Kết nối bị gián đoạn. Vui lòng thử lại.",
      );
    } finally {
      submitting.current = false;
    }
  }
  if (!ready) return <p role="status">Đang mở giỏ bánh…</p>;
  if (!items.length)
    return (
      <div className="empty-state">
        <h2>Bạn chưa chọn bánh.</h2>
        <Link className="button" href="/menu">
          Ghé menu
        </Link>
      </div>
    );
  const fields: {
    name: keyof CustomerInput;
    label: string;
    placeholder: string;
    autoComplete: string;
    type?: string;
  }[] = [
    {
      name: "customerName",
      label: "Họ và tên",
      placeholder: "Tên người nhận bánh",
      autoComplete: "name",
    },
    {
      name: "phone",
      label: "Số điện thoại",
      placeholder: "09xx xxx xxx",
      autoComplete: "tel",
      type: "tel",
    },
    {
      name: "address",
      label: "Địa chỉ",
      placeholder: "Số nhà, tên đường, tòa nhà…",
      autoComplete: "street-address",
    },
    {
      name: "ward",
      label: "Phường / Xã",
      placeholder: "Phường / xã nhận bánh",
      autoComplete: "address-level3",
    },
    {
      name: "district",
      label: "Quận / Huyện (khu vực)",
      placeholder: "Khu vực giao hàng",
      autoComplete: "address-level2",
    },
    {
      name: "city",
      label: "Thành phố",
      placeholder: "Hà Nội",
      autoComplete: "address-level1",
    },
  ];
  return (
    <form
      onSubmit={(event) => void handleSubmit(submit)(event)}
      onChange={(event) => {
        if (event.target instanceof HTMLInputElement && ["address", "ward", "district", "city"].includes(event.target.name)) resetQuote();
      }}
      className="checkout-grid"
      noValidate
    >
      <div className="form-panel">
        <h2>Gửi bánh đến bạn</h2>
        <p>Giao trong phạm vi dưới 8 km từ Đại học Kinh tế Quốc dân, hoặc nhận bánh tại NEU.</p>
        <div className="form-grid">
          {fields.filter((field) => shippingMethod === "DELIVERY" || ["customerName", "phone"].includes(field.name)).map((field) => (
            <div
              className={`field ${field.name === "address" ? "wide" : ""}`}
              key={field.name}
            >
              <label htmlFor={field.name}>
                {field.label} <span aria-hidden="true">*</span>
              </label>
              <input
                id={field.name}
                type={field.type || "text"}
                autoComplete={field.autoComplete}
                placeholder={field.placeholder}
                readOnly={field.name === "city"}
                aria-invalid={!!errors[field.name]}
                aria-describedby={
                  errors[field.name] ? `${field.name}-error` : undefined
                }
                {...register(field.name)}
              />
              {errors[field.name] && (
                <p id={`${field.name}-error`} className="form-error">
                  {errors[field.name]?.message}
                </p>
              )}
            </div>
          ))}
          <div className="field wide">
            <label htmlFor="note">
              Ghi chú <span className="muted">(không bắt buộc)</span>
            </label>
            <textarea
              id="note"
              rows={3}
              placeholder="Lời nhắn nhỏ cho Mildkin…"
              {...register("note")}
            />
            {errors.note && <p className="form-error">{errors.note.message}</p>}
          </div>
        </div>
        <ShippingOptions
          method={shippingMethod}
          quote={currentQuote}
          address={deliveryAddress}
          requestVersion={quoteRequest}
          version={quoteVersion}
          onMethodChange={selectMethod}
          onQuote={(result, address) => setQuote({ addressKey: addressQuoteKey(address), quote: result })}
          onReset={resetQuote}
          disabled={isSubmitting}
        />
      </div>
      <aside className="summary">
        <h2>Một túi ngọt ngào</h2>
        {lines.map((line) => (
          <div className="summary-row" key={line.productId}>
            <span>
              {line.product?.name || "Bánh không còn bán"}{" "}
              <small>× {line.quantity}</small>
            </span>
            <span>
              {formatCurrency((line.product?.price || 0) * line.quantity)}
            </span>
          </div>
        ))}
        <div className="summary-row">
          <span>{shippingMethod === "PICKUP" ? "Nhận tại NEU" : "Phí giao hàng"}</span>
          <span>{shippingFee === null ? "Chưa xác định" : shippingMethod === "DELIVERY" && shippingFee === 0 ? "Miễn phí" : formatCurrency(shippingFee)}</span>
        </div>
        <div className="summary-row total">
          <span>{shippingFee === null ? "Tiền bánh (chưa gồm ship)" : "Tổng cộng"}</span>
          <strong>{formatCurrency(subtotal + (shippingFee ?? 0))}</strong>
        </div>
        <div className="payment-method">
          <LockKeyhole size={18} />
          <div>
            <strong>Chuyển khoản ngân hàng</strong>
            <p>Quét QR · Tự động xác nhận</p>
          </div>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {invalid && (
          <p className="form-error">
            Có món đã hết hoặc không đủ số lượng.{" "}
            <Link href="/cart">Cập nhật giỏ bánh</Link>
          </p>
        )}
        <button
          className="button full-width"
          disabled={isSubmitting || invalid || shippingFee === null}
          type="submit"
        >
          {isSubmitting ? "Đang tạo đơn…" : "Đặt hàng"}
          <ArrowRight size={17} />
        </button>
        <p className="fine-print">
          Bạn sẽ có 15 phút để thanh toán sau khi đặt hàng.
        </p>
      </aside>
    </form>
  );
}
