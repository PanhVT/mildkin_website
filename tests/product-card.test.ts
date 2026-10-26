import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import type { Product } from '@/db/schema';
vi.mock('@/components/cart/cart-provider', () => ({ useCart: () => ({ add: vi.fn(), items: [] }) }));
import { ProductCard } from '@/components/products/product-card';
const product: Product = { id:'new-id', slug:'new-cookie', name:'New Cookie', description:'<b>Plain text</b>', unitsPerPack: 1, packLabel:'1 cookie / pack', price:35000, stock:0, imageUrl:'/images/original.webp', category:'COOKIE', isSpecial:false, flavor:'original', active:true, seasonal:false, createdAt:0, updatedAt:0 };
describe('product card availability', () => {
  it.each([false,true])('dims sold out products and disables purchase, special=%s', isSpecial => {
    const html = renderToStaticMarkup(createElement(ProductCard, { product:{...product,isSpecial} }));
    expect(html).toContain('is-sold-out');
    expect(html).toContain('sold-out-overlay');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>/);
    expect(html).toContain('Hết hàng');
    expect(html).toContain('1 cookie / pack');
    expect(html).toContain('&lt;b&gt;Plain text&lt;/b&gt;');
    if(isSpecial) expect(html).toContain('SPECIAL');
  });
  it('enables purchase when inventory is available', () => {
    const html=renderToStaticMarkup(createElement(ProductCard,{product:{...product,stock:3}}));
    expect(html).not.toContain('disabled=""');
    expect(html).not.toContain('is-sold-out');
    expect(html).toContain('Thêm vào giỏ');
  });
});

it.each(['1 cookie / pack', '2 cookies / pack', '6 cookies / box'])('renders each product label %s', packLabel => {
  const html = renderToStaticMarkup(createElement(ProductCard, {product:{...product,packLabel,stock:3}}));
  expect(html).toContain(packLabel);
  expect(html).not.toContain('3 cookies / pack');
});
it.each([null, '', '   '])('uses compatibility fallback for %s', packLabel => {
  expect(renderToStaticMarkup(createElement(ProductCard, {product:{...product,packLabel}}))).toContain('3 cookies / pack');
});
it('escapes even unsafe legacy label data rather than rendering markup', () => {
  const html = renderToStaticMarkup(createElement(ProductCard, {product:{...product,unitsPerPack: 1, packLabel:'<script>alert(1)</script>'}}));
  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;script&gt;');
});
