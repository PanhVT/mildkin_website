import { LoaderCircle } from "lucide-react";

export function ShippingQuoteButton({ busy, disabled, onClick }: { busy: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" className="button" onClick={onClick} disabled={busy || disabled} aria-busy={busy}>
      {busy && <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />}
      {busy ? "Đang tính khoảng cách..." : "Tính phí giao hàng"}
    </button>
  );
}
