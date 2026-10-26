"use client";

import { Banknote, HandCoins } from "lucide-react";
import { paymentMethodLabel, type PaymentMethod } from "@/lib/payments/method";
import "./payment-options.css";

export function PaymentOptions({ method, shippingMethod, disabled, onChange }: {
  method: PaymentMethod;
  shippingMethod: string;
  disabled: boolean;
  onChange: (method: PaymentMethod) => void;
}) {
  return <fieldset className="checkout-payment-options" disabled={disabled}>
    <legend>Phương thức thanh toán</legend>
    {(["BANK_TRANSFER", "COD"] as const).map(value => {
      const Icon = value === "COD" ? HandCoins : Banknote;
      return <label className={`checkout-payment-choice ${method === value ? "is-selected" : ""}`} key={value}>
        <input type="radio" name="paymentMethod" value={value} checked={method === value} onChange={() => onChange(value)} />
        <Icon size={22} aria-hidden="true" />
        <span><strong>{paymentMethodLabel(value, shippingMethod)}</strong><small>{value === "COD"
          ? "Thanh toán khi bạn nhận bánh từ Mildkin."
          : "Thanh toán qua mã QR / chuyển khoản. Đơn hàng được xác nhận thanh toán tự động qua SePay."}</small></span>
      </label>;
    })}
  </fieldset>;
}
