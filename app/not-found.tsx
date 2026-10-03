import Link from "next/link";
export default function NotFound() {
  return (
    <section className="container section empty-state">
      <span className="eyebrow">404 · MILDKIN</span>
      <h1>Chưa tìm thấy trang này.</h1>
      <p>Nếu đây là đơn hàng của bạn, hãy mở bằng trình duyệt đã đặt bánh.</p>
      <Link className="button" href="/menu">
        Ghé menu bánh
      </Link>
    </section>
  );
}
