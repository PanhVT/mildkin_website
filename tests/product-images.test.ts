import { beforeEach, expect, it, vi } from 'vitest';
const bucket = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/env', () => ({ getEnv: async () => ({ PRODUCT_IMAGES: bucket }) }));
import { GET } from '@/app/api/product-images/[key]/route';
const key = '12345678-1234-4234-8234-123456789abc.png';
beforeEach(() => bucket.get.mockReset());
it.each(['../secret', 'bad.svg', 'products/../../secret', '%2e%2e', 'photo.png'])('rejects unsafe image key %s without reading R2', async key => {
  expect((await GET(new Request('https://test.example'), {params:Promise.resolve({key})})).status).toBe(404);
  expect(bucket.get).not.toHaveBeenCalled();
});
it('serves immutable uniquely named images with safe MIME', async () => {
  bucket.get.mockResolvedValue({body:new Uint8Array([137,80,78,71])});
  const result=await GET(new Request('https://test.example'), {params:Promise.resolve({key})});
  expect(result.status).toBe(200);
  expect(result.headers.get('content-type')).toBe('image/png');
  expect(result.headers.get('cache-control')).toContain('immutable');
  expect(result.headers.get('x-content-type-options')).toBe('nosniff');
});
it('returns 404 for missing images', async () => {
  bucket.get.mockResolvedValue(null);
  expect((await GET(new Request('https://test.example'), {params:Promise.resolve({key})})).status).toBe(404);
});
