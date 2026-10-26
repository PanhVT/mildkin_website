import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { Product } from "@/db/schema";
const mocks = vi.hoisted(() => ({ featured: vi.fn(), catalog: vi.fn() }));
vi.mock("@/lib/catalog", () => ({ getFeaturedProducts: mocks.featured, getProducts: mocks.catalog }));
vi.mock("@/components/cart/cart-provider", () => ({ useCart: () => ({ add: vi.fn(), items: [] }) }));
import Home from "@/app/page";
import Menu from "@/app/menu/page";
const product: Product = { id: "new", slug: "new", name: "New Cookie", description: "Fresh", unitsPerPack: 1, packLabel: "6 cookies / box", price: 30000, stock: 2, imageUrl: "/images/original.webp", flavor: "original", category: "COOKIE", isSpecial: false, seasonal: false, active: true, createdAt: 0, updatedAt: 0 };
beforeEach(() => { vi.stubGlobal("React", React); vi.clearAllMocks(); });
it("renders the homepage empty state and menu link without sold-out cards", async () => {
  mocks.featured.mockResolvedValue([]);
  const html = renderToStaticMarkup(await Home());
  expect(html).toContain("Bánh đang được Mildkin chuẩn bị thêm ♡");
  expect(html).toContain("Bạn quay lại một chút nhé.");
  expect(html).toMatch(/href="\/menu">Xem menu<\/a>/);
  expect(html).not.toContain("Hết hàng");
  expect(mocks.catalog).not.toHaveBeenCalled();
});
it("renders only the returned homepage products with available purchase and saved pack label", async () => {
  mocks.featured.mockResolvedValue([product, { ...product, id: "other", slug: "other", name: "Other Cookie" }]);
  const html = renderToStaticMarkup(await Home());
  expect(html.match(/class="product-card/g)).toHaveLength(2);
  expect(html).toContain("6 cookies / box");
  expect(html).toContain("Thêm vào giỏ");
  expect(html).toContain("Khám phá menu");
  expect(html).not.toContain("Hết hàng");
  expect(html).not.toContain("Bánh đang được Mildkin chuẩn bị thêm");
});
it("keeps sold-out standard and special products visible and disabled on menu", async () => {
  mocks.catalog.mockResolvedValue([{ ...product, stock: 0 }, { ...product, id: "special", isSpecial: true, stock: 0 }]);
  const html = renderToStaticMarkup(await Menu());
  expect(mocks.catalog).toHaveBeenCalledWith({ inStockFirst: true });
  expect(html.match(/sold-out-overlay/g)).toHaveLength(2);
  expect(html.match(/<button[^>]*disabled=""/g)).toHaveLength(6);
  expect(html).toContain("menu-special");
  expect(mocks.featured).not.toHaveBeenCalled();
});
it("renders category hierarchy independently of product names", async () => {
  mocks.catalog.mockResolvedValue([
    { ...product, name: "Standard sample" },
    { ...product, id: "special", name: "Special sample", isSpecial: true },
    { ...product, id: "chunky", name: "Chunky sample", category: "CHUNKY" },
  ]);
  const html = renderToStaticMarkup(await Menu());
  expect(html).toMatch(/<h2 id="signature-title">MILDKIN SIGNATURE<\/h2>/);
  expect(html).toMatch(/<h3 id="standard-title">STANDARD<\/h3>[\s\S]*Standard sample[\s\S]*<h3 id="special-title">SPECIAL<\/h3>[\s\S]*Special sample[\s\S]*<h2 id="chunky-title">CHUNKY COOKIES<\/h2>[\s\S]*Chunky sample/);
  expect(mocks.catalog).toHaveBeenCalledTimes(1);
});
it.each(["signature_standard", "signature_special", "chunky", "empty"])("hides empty headings when only %s is present", async line => {
  mocks.catalog.mockResolvedValue(line === "empty" ? [] : [{ ...product, category: line === "chunky" ? "CHUNKY" : "COOKIE", isSpecial: line === "signature_special" }]);
  const html = renderToStaticMarkup(await Menu());
  expect(html.includes('id="standard-title"')).toBe(line === "signature_standard");
  expect(html.includes('id="special-title"')).toBe(line === "signature_special");
  expect(html.includes('id="chunky-title"')).toBe(line === "chunky");
  expect(html.includes('id="signature-title"')).toBe(line.startsWith("signature"));
});
