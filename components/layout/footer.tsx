import Link from "next/link";
import Image from "next/image";
import { Camera as Instagram, ArrowUpRight } from "lucide-react";
import { site } from "@/config/site";
export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-top">
        <div>
          <Link href="/" className="wordmark">
            <Image
              className="shop-avatar"
              src="/images/avatar.webp"
              alt=""
              width={54}
              height={54}
            />
            mildkin
          </Link>
          <p>{site.tagline}</p>
        </div>
        <div>
          <a
            className="social-link"
            href={site.instagram}
            target="_blank"
            rel="noreferrer"
          >
            <Instagram size={18} />
            {site.instagramHandle}
            <ArrowUpRight size={16} />
          </a>
          <p>Hanoi, Vietnam · Bánh nhỏ, thương nhiều.</p>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} Mildkin Cookies</span>
        <span>Handmade with a little extra love ♡</span>
      </div>
    </footer>
  );
}
