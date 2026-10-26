"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="seller-card">
      <h1>Chưa thể tải dữ liệu</h1>
      <p>
        Kiểm tra bộ lọc ngày hoặc thử tải lại. Nếu vẫn lỗi, kiểm tra cấu hình và
        migration của cửa hàng.
      </p>
      <button onClick={reset}>Thử lại</button>
      <a href="/seller">Về tổng quan</a>
    </section>
  );
}
