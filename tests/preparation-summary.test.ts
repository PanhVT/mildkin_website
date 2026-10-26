import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { PreparationSummary } from "@/components/seller/preparation-summary";
beforeEach(() => vi.stubGlobal("React", React));

it("renders the empty state instead of an empty product grid", () => {
  const html = renderToStaticMarkup(React.createElement(PreparationSummary, { summary: { products: [], totalItems: 0, totalPieces: 0, productTypes: 0 } }));
  expect(html).toContain("Hiện chưa có bánh nào cần chuẩn bị ♡");
  expect(html).not.toContain("seller-preparation-grid");
});
it("renders numeric pieces, snapshot names, R2 images and missing-image fallback", () => {
  const html = renderToStaticMarkup(React.createElement(PreparationSummary, { summary: {
    products: [
      { productId: "one", name: "Snapshot Cookie", quantity: 5, totalPieces: 15, unitsPerPack: 3, imageUrl: "/api/product-images/one.webp", packLabel: "99 cookies / pack" },
      { productId: "two", name: "Second Cookie", quantity: 1, totalPieces: 1, unitsPerPack: 1, imageUrl: null, packLabel: null },
    ], totalItems: 6, totalPieces: 16, productTypes: 2,
  } }));
  expect(html).toContain("2 loại sản phẩm · 16 cái bánh");
  expect(html).toContain("Snapshot Cookie");
  expect(decodeURIComponent(html)).toContain("/api/product-images/one.webp");
  expect(html).toContain("99 cookies / pack");
  expect(html).toContain("Bánh Mildkin");
  expect(html).not.toContain("495");
  expect(html).toContain("Tổng cộng:");
  expect(html).toContain("15 cái");
});
