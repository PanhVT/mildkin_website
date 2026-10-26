import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ShippingQuoteButton } from "@/components/checkout/shipping-quote-button";
it("disables the loading button and renders an accessible spinner state", () => {
  const html = renderToStaticMarkup(createElement(ShippingQuoteButton, { busy: true, disabled: false, onClick: () => {} }));
  expect(html).toContain('disabled=""');
  expect(html).toContain('aria-busy="true"');
  expect(html).toContain("animate-spin");
  expect(html).toContain("Đang tính khoảng cách...");
});
it("enables the ready button with its original label", () => {
  const html = renderToStaticMarkup(createElement(ShippingQuoteButton, { busy: false, disabled: false, onClick: () => {} }));
  expect(html).not.toContain('disabled=""');
  expect(html).toContain("Tính phí giao hàng");
});
