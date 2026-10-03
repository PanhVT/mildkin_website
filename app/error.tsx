"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="container section empty-state">
      <h1>Căn bếp đang bận một chút.</h1>
      <p>Chưa tải được thông tin. Bạn thử lại sau ít phút nhé.</p>
      <button className="button" onClick={reset}>
        Thử lại
      </button>
    </section>
  );
}
