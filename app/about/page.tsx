import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Heart, Leaf, PawPrint, Sparkles } from "lucide-react";
import { CookieFriends } from "@/components/about/cookie-friends";
import { site } from "@/config/site";
import "./about.css";

export const metadata: Metadata = {
  title: "Về Mildkin",
  description:
    "Tìm hiểu câu chuyện Mildkin — những chiếc butter cookies nhỏ xinh, ít ngọt và được làm với sự chăm chút tại Hà Nội.",
  openGraph: {
    title: "Về Mildkin",
    description:
      "Little cookies, gentle moments. Câu chuyện từ căn bếp nhỏ của Mildkin tại Hà Nội.",
  },
};

export default function AboutPage() {
  return (
    <div className="about-page">
      <section className="container about-hero">
        <div>
          <span className="eyebrow">A LITTLE STORY ABOUT US</span>
          <h1>
            Mildkin bắt đầu từ
            <br />
            <em>những điều nhỏ bé.</em>
          </h1>
          <p>
            Chúng mình tin rằng đôi khi một chiếc bánh nhỏ cũng đủ làm một ngày
            trở nên dịu dàng hơn.
          </p>
          <p>
            Mildkin được tạo nên từ những chiếc butter cookies ít ngọt, những
            hình dáng đáng yêu và mong muốn gửi một chút ấm áp vào những khoảnh
            khắc rất bình thường.
          </p>
          <Link href="/menu" className="button">
            Gặp các bạn trong giỏ bánh <ArrowRight size={18} />
          </Link>
        </div>
        <div className="about-hero-art">
          <Image
            src="/images/about-friends-v2.webp"
            alt="Ba người bạn gấu, thỏ và mèo giữa hoa lá và những trái tim pastel"
            width={941}
            height={1672}
            priority
            sizes="(max-width: 768px) 90vw, 45vw"
          />
          <span className="about-art-note">
            <Heart size={17} aria-hidden="true" /> little cookies, gentle
            moments.
          </span>
        </div>
      </section>

      <section className="container about-section" aria-labelledby="name-title">
        <div className="about-heading">
          <span className="eyebrow">A NAME, A FEELING</span>
          <h2 id="name-title">Vì sao là Mildkin?</h2>
        </div>
        <div className="about-name-grid">
          <article className="about-name-card">
            <span className="about-word">mild</span>
            <h3>Nhẹ nhàng</h3>
            <p>
              Mild là cảm giác chúng mình muốn gửi vào từng chiếc bánh: vị vừa
              đủ, màu sắc dịu dàng và những khoảnh khắc không cần quá cầu kỳ để
              trở nên đáng nhớ.
            </p>
          </article>
          <article className="about-name-card">
            <span className="about-word">kin</span>
            <h3>Thân thuộc</h3>
            <p>
              Kin là cảm giác gần gũi như một người bạn nhỏ. Mildkin mong những
              chiếc bánh không chỉ là món ăn, mà còn là một điều dễ thương bạn
              muốn chia sẻ với người mình quý.
            </p>
          </article>
        </div>
        <p className="about-equation">
          mild <span>+</span> kin <span>=</span> mildkin{" "}
          <Heart size={22} aria-hidden="true" />
        </p>
      </section>

      <section className="about-philosophy">
        <div className="container about-section">
          <div className="about-heading">
            <span className="eyebrow">OUR LITTLE PHILOSOPHY</span>
            <h2>Những điều Mildkin tin</h2>
            <p>Một chút ngọt, đủ để mỉm cười.</p>
          </div>
          <div className="about-three-grid">
            {[
              {
                Icon: Sparkles,
                label: "Freshly baked",
                title: "Bánh được làm với sự chăm chút",
                text: "Mỗi mẻ bánh đều được chuẩn bị để giữ cảm giác thơm, mềm và gần gũi của một món bánh handmade.",
              },
              {
                Icon: Leaf,
                label: "Less sweet",
                title: "Ngọt vừa đủ",
                text: "Chúng mình thích vị ngọt nhẹ để bạn có thể thưởng thức bánh một cách dễ chịu hơn.",
              },
              {
                Icon: PawPrint,
                label: "Made with care",
                title: "Những chi tiết nhỏ cũng quan trọng",
                text: "Từ hình dáng Bear, Rabbit, Cat cho tới cách đóng gói, Mildkin muốn mỗi đơn hàng đều mang lại một chút niềm vui.",
              },
            ].map(({ Icon, label, title, text }) => (
              <article className="about-value" key={label}>
                <Icon size={28} aria-hidden="true" />
                <span className="eyebrow">{label}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <CookieFriends />

      <section className="container about-section about-kitchen">
        <div>
          <span className="eyebrow">FROM OUR KITCHEN TO YOU</span>
          <h2>Từ căn bếp nhỏ đến tay bạn</h2>
          <p>Hiện tại Mildkin làm và giao bánh tại Hà Nội.</p>
          <p>
            Mỗi đơn hàng là một chiếc túi nhỏ chứa ba người bạn Bear, Rabbit
            hoặc Cat — đôi khi đơn giản, đôi khi có thêm những gương mặt ngộ
            nghĩnh.
          </p>
          <p>
            Chúng mình vẫn đang từng bước hoàn thiện Mildkin, thử thêm những
            hương vị mới và tìm cách để mỗi lần nhận bánh đều trở thành một trải
            nghiệm thật dễ thương.
          </p>
        </div>
        <div className="about-kitchen-note">
          <PawPrint size={38} aria-hidden="true" />
          <span className="eyebrow">GỬI TỪ HÀ NỘI</span>
          <p>
            Một chút ngọt,
            <br />
            đủ để mỉm cười.
          </p>
          <Heart size={28} aria-hidden="true" />
          <span>with a little extra love</span>
        </div>
      </section>

      <section className="container about-section about-moments">
        <div className="about-heading">
          <span className="eyebrow">SMALL MOMENTS</span>
          <h2>Cookies cho những khoảnh khắc rất bình thường.</h2>
        </div>
        <ul>
          {[
            "Một buổi học dài",
            "Một chiều uống matcha",
            "Một món quà nhỏ",
            "Một buổi xem phim",
            "Một lời cảm ơn",
            "Một ngày cần chút ngọt",
          ].map((moment) => (
            <li key={moment}>{moment}</li>
          ))}
        </ul>
      </section>

      <section className="container about-cta">
        <Heart size={30} aria-hidden="true" />
        <h2>Một chút ngọt cho ngày của bạn?</h2>
        <p>Chọn một người bạn nhỏ và để Mildkin gửi bánh đến bạn.</p>
        <div>
          <Link href="/menu" className="button">
            Xem menu <ArrowRight size={18} />
          </Link>
          <a
            href={site.instagram}
            className="button button-light"
            target="_blank"
            rel="noopener noreferrer"
          >
            Instagram <ArrowRight size={18} />
          </a>
        </div>
      </section>
    </div>
  );
}
