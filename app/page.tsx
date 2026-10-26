import { CookieFriends } from "@/components/about/cookie-friends";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Heart,
  Leaf,
  Sparkles,
  Asterisk,
  Camera as Instagram,
} from "lucide-react";
import { getFeaturedProducts } from "@/lib/catalog";
import { ProductCard } from "@/components/products/product-card";
import { site } from "@/config/site";
export const dynamic = "force-dynamic";
export default async function Home() {
  const products = await getFeaturedProducts();
  return (
    <div className="home-page">
      <section className="home-hero" aria-label="Mildkin — bánh quy thủ công">
        <div className="container hero">
          <div className="hero-copy">
            <span className="eyebrow">
              <Asterisk aria-hidden="true" focusable="false" className="homepage-separator hero-separator" color="#314822" strokeWidth={2} /> HANDMADE COOKIES · HÀ NỘI
            </span>
            <h1>
              Một chiếc bánh nhỏ.
              <br />
              Một ngày <em>dịu hơn.</em>
            </h1>
            <p>
              Thơm bơ, ngọt nhẹ, nướng bằng cả sự chăm chút.
              <br className="desktop-break" /> Mildkin gửi bạn một chút bình yên
              trong từng chiếc bánh.
            </p>
            <div className="hero-actions">
              <Link className="button" href="/menu">
                Đặt bánh ngay <ArrowUpRight size={18} />
              </Link>
              <Link className="text-link" href="/menu">
                Xem menu <ArrowRight size={17} />
              </Link>
            </div>
            <div className="hero-note">
              <Heart size={15} /> little cookies, gentle moments.
            </div>
          </div>
        </div>
      </section>
      <div className="values-ribbon">
        {["Nướng mới mỗi mẻ", "Ngọt vừa đủ", "Thủ công từ trái tim", "Một gói, ba niềm vui"].map((text, index) => <span className="values-ribbon-item" key={text}>
          {index > 0 && <Asterisk aria-hidden="true" focusable="false" className="homepage-separator" color="#314822" strokeWidth={2} />}
          <span>{text}</span>
        </span>)}
      </div>
      <section id="menu" className="section container">
        <div className="section-heading">
          <div>
            <span className="eyebrow">FROM OUR LITTLE OVEN</span>
            <h2>
              Chọn một chút <em>ngọt ngào.</em>
            </h2>
            <p>Những chiếc bánh đang sẵn sàng. Bạn sẽ thương vị nào?</p>
          </div>
          <Link className="text-link" href="/menu">
            Khám phá menu <ArrowUpRight size={17} />
          </Link>
        </div>
        {products.length > 0 ? (
          <div className="product-grid">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3>Bánh đang được Mildkin chuẩn bị thêm ♡</h3>
            <p>Bạn quay lại một chút nhé.</p>
            <Link className="button" href="/menu">Xem menu</Link>
          </div>
        )}
        <p className="image-disclaimer">
          Ảnh bánh Mildkin · Hình dáng có thể thay đổi
          theo mẻ bánh.
        </p>
      </section>
      <section id="our-story" className="why-section">
        <div className="container">
          <div className="center-heading">
            <span className="eyebrow">THE MILDKIN WAY</span>
            <h2>
              Những điều nhỏ, <em>làm nên Mildkin.</em>
            </h2>
            <p>Không cầu kỳ. Chỉ là bánh ngon, được làm thật tử tế.</p>
          </div>
          <div className="why-grid">
            <article>
              <div className="feature-icon">
                <Sparkles aria-hidden="true" color="#314822" />
              </div>
              <span className="small-label">01 / FRESHLY BAKED</span>
              <h3>Thơm từ mẻ bánh mới</h3>
              <p>
                Từng mẻ nhỏ được nướng mới, để khi đến tay bạn, bánh vẫn trọn
                hương bơ thân thuộc.
              </p>
            </article>
            <article>
              <div className="feature-icon">
                <Leaf />
              </div>
              <span className="small-label">02 / LESS SWEET</span>
              <h3>Ngọt nhẹ, vừa thương</h3>
              <p>
                Một chút ngọt vừa đủ để vị bơ, cacao và matcha được kể câu
                chuyện của riêng mình.
              </p>
            </article>
            <article>
              <div className="feature-icon">
                <Heart />
              </div>
              <span className="small-label">03 / MADE WITH CARE</span>
              <h3>Chăm chút từng chiếc</h3>
              <p>
                Từ nhào bột, tạo hình đến gói bánh — mọi điều đều được làm bằng
                đôi tay và sự nâng niu.
              </p>
            </article>
          </div>
        </div>
      </section>
      <CookieFriends />
      <section className="container instagram-section">
        <Image
          className="story-avatar"
          src="/images/avatar-seamless.webp"
          alt="Avatar Mildkin: mèo, gấu và thỏ bên chiếc bánh bơ"
          width={180}
          height={225}
        />
        <Instagram size={26} />
        <span className="eyebrow">A LITTLE MORE MILDKIN</span>
        <h2>Ghé căn bếp nhỏ của tụi mình.</h2>
        <p>Mẻ bánh mới, những chuyện nhỏ và một chút ngọt ngào mỗi ngày.</p>
        <a
          className="button button-light"
          href={site.instagram}
          target="_blank"
          rel="noreferrer"
        >
          Theo dõi Mildkin trên Instagram <ArrowUpRight size={17} />
        </a>
        <span className="insta-handle">{site.instagramHandle}</span>
      </section>
    </div>
  );
}
