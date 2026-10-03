"use client";
import { useState, type MutableRefObject } from "react";
import { formatCurrency } from "@/lib/currency";
import { formatDistance, pickupDescription, outOfRangeMessage, type ShippingMethod, type ShippingQuote } from "@/lib/shipping";

import { deliveryAddressSchema, type DeliveryAddress } from "@/lib/validation";
export function ShippingOptions({ method, quote, address, requestVersion, version, onMethodChange, onQuote, onReset, disabled }: {
  method: ShippingMethod;
  quote: ShippingQuote | null;
  address: DeliveryAddress;
  requestVersion: MutableRefObject<number>;
  version: number;
  onMethodChange: (method: ShippingMethod) => void;
  onQuote: (quote: ShippingQuote, address: DeliveryAddress) => void;
  onReset: () => void;
  disabled: boolean;
}) {
  const [pendingVersion, setPendingVersion] = useState<number | null>(null);
  const [error, setError] = useState("");
  const busy = pendingVersion !== null && pendingVersion === version;
  async function checkAddress() {
    const parsed = deliveryAddressSchema.safeParse(address);
    if (!parsed.success) return;
    onReset();
    const requestId = requestVersion.current;
    setPendingVersion(requestId);
    setError("");
    try {
      const response = await fetch("/api/shipping/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      const data = await response.json() as ShippingQuote & { error?: string };
      if (!response.ok) throw new Error(data.error || "Chưa thể xác định địa chỉ lúc này. Bạn vui lòng thử lại sau.");
      if (requestId === requestVersion.current) onQuote(data, parsed.data);
    } catch (e) {
      if (requestId === requestVersion.current) setError(e instanceof Error && e.name !== "TimeoutError" ? e.message : "Chưa thể xác định địa chỉ lúc này. Bạn vui lòng thử lại sau.");
    } finally {
      if (requestId === requestVersion.current) setPendingVersion(null);
    }
  }
  return (
    <fieldset className="shipping-options" disabled={disabled}>
      <legend>Phương thức nhận hàng</legend>
      <div className="shipping-choices">
        {([ ["DELIVERY", "Giao hàng"], ["PICKUP", "Tự đến NEU lấy hàng"] ] as const).map(([value, label]) => (
          <label key={value}>
            <input type="radio" name="shippingMethod" value={value} checked={method === value} onChange={() => { setError(""); onMethodChange(value); }} />
            {label}
          </label>
        ))}
      </div>
      {method === "PICKUP" ? (
        <div className="shipping-card">
          <h3>Tự đến NEU lấy hàng</h3>
          <p>Bạn có thể đến khu vực Đại học Kinh tế Quốc dân để nhận bánh.</p>
          <p><strong>Phí nhận hàng: {formatCurrency(0)}</strong></p>
          <p>{pickupDescription}</p>
        </div>
      ) : (
        <div className="shipping-card">
          <p>Phí giao hàng được tính dựa trên địa chỉ nhận bánh của bạn.</p>
          <button type="button" className="button" onClick={checkAddress} disabled={busy || !deliveryAddressSchema.safeParse(address).success}>
            {busy ? "Đang kiểm tra địa chỉ…" : error ? "Thử lại" : "Tính phí giao hàng"}
          </button>
          <p className="fine-print">Tra cứu địa chỉ bằng <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer">Geoapify</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>.</p>
          <div role="status" aria-live="polite">
            {error && <p className="form-error">{error}</p>}
            {quote?.available && <p>Khoảng cách từ Mildkin: {formatDistance(quote.distanceKm)} km<br />Phí giao hàng: <strong>{quote.fee === 0 ? "Miễn phí" : formatCurrency(quote.fee)}</strong></p>}
            {quote && !quote.available && <>
              <p className="form-error">{outOfRangeMessage}</p>
              <p>Mildkin hiện giao trong phạm vi dưới 8 km tính từ Đại học Kinh tế Quốc dân. Bạn có thể chọn tự đến NEU lấy bánh nhé ♡</p>
            </>}
          </div>
          {(error || (quote && !quote.available)) && <button type="button" className="button" onClick={() => { setError(""); onMethodChange("PICKUP"); }}>Chọn tự đến NEU lấy hàng</button>}
        </div>
      )}
      <details className="shipping-table">
        <summary>Xem bảng phí ship</summary>
        <dl>
          {[["0–2 km (gồm 2 km)", "Miễn phí"], ["Trên 2–4 km", "10.000đ"], ["Trên 4–6 km", "15.000đ"], ["Trên 6–7 km", "20.000đ"], ["Trên 7–dưới 8 km", "25.000đ"], ["Từ 8 km", "Tự đến NEU lấy hàng"]].map(([range, fee]) => <div key={range}><dt>{range}</dt><dd>{fee}</dd></div>)}
        </dl>
      </details>
    </fieldset>
  );
}
