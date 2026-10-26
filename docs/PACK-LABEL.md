# Nhãn quy cách sản phẩm

- Field D1: `products.pack_label TEXT DEFAULT '3 cookies / pack'`, nullable. Drizzle trả `packLabel`; seller API nhận `pack_label`.
- Migration mới: `drizzle/0006_lucky_queen_noir.sql` (kèm snapshot và journal mới). SQLite áp dụng default cho các hàng đã tồn tại, giữ nhãn đang hiển thị trước đây cho mọi sản phẩm. Không suy đoán quy cách của sản phẩm mới theo tên; seller tự chỉnh giá trị thực tế. Không sửa migration cũ, ID, tồn kho hoặc đơn hàng.
- Seller vào `/seller/products` → **Sửa sản phẩm** → **Quy cách**, hoặc **+ Thêm sản phẩm**. Danh sách hiển thị nhãn ngay dưới mô tả.
- Create và multipart PATCH lưu `pack_label`; JSON PATCH hiện hữu cũng hỗ trợ trường này. Zod trim, tối đa 50 ký tự, từ chối dấu `<`, `>` và ký tự điều khiển. Render bằng React text, không dùng HTML injection.
- Giá trị trống/whitespace được lưu thành `3 cookies / pack`. Create bỏ qua field dùng default; update bỏ qua field giữ nguyên giá trị cũ để tương thích client cũ. UI có fallback chung cho dữ liệu null/empty cũ.
- Query buyer lấy trường trực tiếp từ D1. ProductCard chung cho homepage và menu dùng `product.packLabel`; Special và sản phẩm hết hàng cũng dùng cùng component. Giữ nguyên style badge cream pill, bottom-left; nhãn không bị làm mờ cùng ảnh. Alt ảnh cũng phản ánh quy cách thực tế thay vì cố định gói 3 bánh.
- Đây chỉ là metadata hiển thị. Checkout không dùng nhãn để tính giá, số lượng hay tồn kho; reservation và snapshot đơn hàng giữ nguyên.

## Files

Mới: `lib/products/pack-label.ts`, `lib/seller/product-validation.ts`, `drizzle/0006_lucky_queen_noir.sql`, `drizzle/meta/0006_snapshot.json`, tài liệu này.

Sửa: `db/schema.ts`, `drizzle/meta/_journal.json`, `lib/seller/product-write.ts`, `lib/seller/data.ts`, `components/seller/product-form.tsx`, `app/seller/(dashboard)/products/page.tsx`, `components/products/product-card.tsx`, `tests/seller.test.ts`, `tests/product-card.test.ts`, `tests/auth.test.ts`.

## Lệnh vận hành

Local:

```powershell
npm run db:migrate:local
```

Production, apply migration trước khi deploy code đọc cột mới:

```powershell
npm run db:migrate:remote
npm run deploy
```

Không apply remote migration hoặc deploy trong quá trình thực hiện. Các test D1 dùng database local tạm thời.

## Kết quả kiểm tra

- `npm run typecheck`: đạt.
- `npm run lint`: đạt.
- `npm run test`: 280/280 tests, 15 files đạt.
- Test auth/migration chạy lại sau khi thêm kiểm tra backfill: 22/22 đạt.
- Test seller chạy lại sau khi cải thiện thông báo lỗi: 61/61 đạt.
- `npm run build`: đạt.
- `npm run build:cloudflare`: đạt, đã tạo `.open-next/worker.js`.
- `git diff --check`: đạt.
- Chưa kiểm tra visual trực tiếp trong browser. Không chạy migration trên database local persistent hoặc remote; test migration trên database disposable.
- Cảnh báo không chặn build: OpenNext khuyến nghị WSL trên Windows; Vite thông báo thay đổi config loader trong phiên bản tương lai.
