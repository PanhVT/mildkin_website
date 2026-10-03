import { CookieFriends } from "@/components/about/cookie-friends";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Heart,
  Leaf,
  Sparkles,
  Camera as Instagram,
} from "lucide-react";
import { getProducts } from "@/lib/catalog";
import { ProductCard } from "@/components/products/product-card";
import { site } from "@/config/site";
export const dynamic = "force-dynamic";
export default async function Home() {
  const products = await getProducts();
  return (
    <div className="home-page">
      <section className="container hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="tiny-star">✳</span> HANDMADE COOKIES · HÀ NỘI
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
            <Link className="text-link" href="#menu">
              Xem menu <ArrowRight size={17} />
            </Link>
          </div>
          <div className="hero-note">
            <Heart size={15} /> little cookies, gentle moments.
          </div>
        </div>
        <div className="hero-visual">
          <div className="hero-photo">
            <Image
              src="/images/cookies.webp"
              alt="Đĩa cookies Mildkin hình thỏ, mèo và gấu trên khăn hồng"
              fill
              priority
              sizes="(max-width: 800px) 100vw, 55vw"
            />
          </div>
          <div className="round-stamp">
            baked with
            <br />
            <Heart size={24} />
            <span>love & butter</span>
          </div>
          <div className="photo-note">nhỏ xinh, thơm bơ, thương lắm ♡</div>
        </div>
      </section>
      <div className="values-ribbon">
        <span>Nướng mới mỗi mẻ</span>
        <span>✳</span>
        <span>Ngọt vừa đủ</span>
        <span>✳</span>
        <span>Thủ công từ trái tim</span>
        <span>✳</span>
        <span>Một gói, ba niềm vui</span>
      </div>
      <section id="menu" className="section container">
        <div className="section-heading">
          <div>
            <span className="eyebrow">FROM OUR LITTLE OVEN</span>
            <h2>
              Chọn một chút <em>ngọt ngào.</em>
            </h2>
            <p>Bốn hương vị thân quen. Bạn sẽ thương vị nào?</p>
          </div>
          <Link className="text-link" href="/menu">
            Khám phá menu <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="product-grid">
          {products.slice(0, 4).map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
        <p className="image-disclaimer">
          Ảnh bánh Mildkin · Mỗi gói gồm 3 cookies, hình dáng có thể thay đổi
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
                <Sparkles />
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
