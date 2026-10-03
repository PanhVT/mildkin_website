"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Clock3, CircleCheck } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
type Props = {
  code: string;
  total: number;
  expiresAt: number;
  bank: string;
  account: string;
  holder: string;
  qrUrl: string;
  initialStatus: string;
};
export function PaymentPanel(props: Props) {
  const router = useRouter();
  const [status, setStatus] = useState(props.initialStatus);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [networkError, setNetworkError] = useState(false);
  useEffect(() => {
    const update = () =>
      setRemaining(
        Math.max(0, Math.ceil((props.expiresAt - Date.now()) / 1000)),
      );
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [props.expiresAt]);
  useEffect(() => {
    if (status !== "PENDING") return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let mounted = true;
    async function poll() {
      let again = true;
      try {
        const response = await fetch(`/api/orders/${props.code}/status`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Status unavailable");
        const data = (await response.json()) as { paymentStatus: string };
        if (mounted) {
          setStatus(data.paymentStatus);
          setNetworkError(false);
        }
        again = data.paymentStatus === "PENDING";
      } catch {
        if (mounted) setNetworkError(true);
      }
      if (mounted && again) timer = setTimeout(poll, 4000);
    }
    timer = setTimeout(poll, 4000);
    return () => {
      mounted = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [props.code, status]);
  useEffect(() => {
    if (status === "PAID") {
      const timer = setTimeout(
        () => router.replace(`/orders/${props.code}/success`),
        1200,
      );
      return () => clearTimeout(timer);
    }
  }, [status, props.code, router]);
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage("Đã sao chép.");
    } catch {
      setMessage(
        "Không thể sao chép. Bạn có thể chọn và sao chép thông tin bên dưới.",
      );
    }
  }
  const expired =
    status === "EXPIRED" || (remaining === 0 && status === "PENDING");
  if (status === "PAID")
    return (
      <div className="empty-state">
        <CircleCheck size={50} />
        <h2>Thanh toán thành công 🎉</h2>
        <p>Mildkin đã nhận được thanh toán của bạn.</p>
      </div>
    );
  if (expired || status === "FAILED")
    return (
      <div className="empty-state">
        <Clock3 size={42} />
        <h2>Đơn hàng đã hết thời gian thanh toán.</h2>
        <p>
          Vui lòng không chuyển tiền cho mã đơn này. Nếu đã chuyển, hãy nhắn
          Mildkin kèm mã <strong>{props.code}</strong> để được kiểm tra.
        </p>
        <Link href="/menu" className="button">
          Chọn bánh cho đơn mới
        </Link>
      </div>
    );
  return (
    <div className="payment-grid">
      <div className="qr-card">
        <span className="eyebrow">QUÉT QR BẰNG ỨNG DỤNG NGÂN HÀNG</span>
        <Image
          className="qr-image"
          src={props.qrUrl}
          alt={`Mã QR thanh toán đơn ${props.code}, ${formatCurrency(props.total)}`}
          width={320}
          height={360}
          unoptimized
        />
        <a
          className="text-link"
          href={props.qrUrl}
          target="_blank"
          rel="noreferrer"
        >
          Mở ảnh QR để lưu
        </a>
        <div className="countdown">
          <Clock3 size={17} />
          {remaining === null
            ? "15:00"
            : `${Math.floor(remaining / 60)
                .toString()
                .padStart(
                  2,
                  "0",
                )}:${(remaining % 60).toString().padStart(2, "0")}`}{" "}
          <span>phút còn lại</span>
        </div>
      </div>
      <div className="payment-details">
        <span className="status-pill">Đang chờ thanh toán…</span>
        <h2>{formatCurrency(props.total)}</h2>
        <p>
          Đơn bánh <strong>{props.code}</strong>
        </p>
        <dl>
          <div>
            <dt>Ngân hàng</dt>
            <dd>{props.bank}</dd>
          </div>
          <div>
            <dt>Chủ tài khoản</dt>
            <dd>{props.holder}</dd>
          </div>
          <div>
            <dt>Số tài khoản</dt>
            <dd>
              {props.account}
              <button
                className="icon-button"
                aria-label="Sao chép số tài khoản"
                onClick={() => copy(props.account)}
              >
                <Copy size={17} />
              </button>
            </dd>
          </div>
          <div>
            <dt>Nội dung chuyển khoản</dt>
            <dd>
              {props.code}
              <button
                className="icon-button"
                aria-label="Sao chép nội dung chuyển khoản"
                onClick={() => copy(props.code)}
              >
                <Copy size={17} />
              </button>
            </dd>
          </div>
        </dl>
        <p className="notice">
          Vui lòng chuyển đúng số tiền và giữ nguyên nội dung chuyển khoản để
          Mildkin tự động xác nhận đơn hàng.
        </p>
        <p role="status">{message}</p>
        {networkError && (
          <p className="form-error" role="status">
            Kết nối kiểm tra thanh toán đang gián đoạn. Hệ thống sẽ thử lại; bạn
            không cần chuyển tiền lần nữa.
          </p>
        )}
      </div>
    </div>
  );
}
