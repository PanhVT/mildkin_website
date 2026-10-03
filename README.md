# mildkin

Shop cookies tiếng Việt cho Hà Nội. Next.js App Router + TypeScript + Tailwind, chạy trên Cloudflare Workers qua OpenNext. Database **Cloudflare D1**, truy vấn bằng Drizzle; thanh toán chuyển khoản SePay / VietQR.

## Kiến trúc

```text
Browser → Next.js (OpenNext / Cloudflare Worker) → Drizzle → D1 binding DB
Khách → VietQR → Ngân hàng → SePay → webhook đã xác thực → D1 → polling → thành công
```

Giá, tổng tiền, phí giao hàng và trạng thái thanh toán đều do server quyết định. localStorage chỉ chứa `{productId, quantity}`. Trang đơn hàng cần cookie HttpOnly riêng; mã đơn một mình không cho phép đọc dữ liệu khách hàng. Không có nút giả lập thanh toán trong cửa hàng.

### Cấu trúc

- `app/`: trang chủ, menu, cart, checkout, payment/success, admin và API.
- `components/`: giao diện và tương tác theo tính năng.
- `db/schema.ts`, `db/index.ts`: schema và kết nối Drizzle/D1.
- `drizzle/`: migration bảng, index và trigger, được Wrangler áp dụng theo thứ tự.
- `db/invariants.sql`: nguồn tham khảo trigger nghiệp vụ; phiên bản chạy nằm trong migration.
- `lib/orders/service.ts`: kiểm tra dữ liệu, giá, tồn kho, tạo đơn bằng D1 batch.
- `lib/payments/sepay/`: HMAC/API key, QR, chuẩn hóa ngân hàng, webhook.
- `lib/admin.ts`: xác minh chữ ký JWT Cloudflare Access bằng JWKS.
- `tests/`: unit test và integration test trên D1 local thật qua Miniflare.
- `wrangler.jsonc`, `open-next.config.ts`: deployment.

### Schema

| Bảng | Nội dung |
|---|---|
| `products` | Giá VND integer, slug, ảnh, flavor, seasonal, active, stock |
| `orders` | Khách hàng, địa chỉ, tổng tiền, trạng thái, hạn 15 phút, hash token truy cập, snapshot tài khoản nhận tiền |
| `order_items` | Snapshot tên/giá, số lượng và sản phẩm |
| `payments` | Giao dịch SePay, transaction ID unique, raw payload, `MATCHED` / `REVIEW`; order_id nullable để giữ giao dịch không khớp |
| `request_limits` | Bộ đếm checkout 10 lần / 5 phút theo IP đã hash, tự dọn khi có request |

Mã đơn dạng `MK` + 10 ký tự hex từ Web Crypto; ràng buộc UNIQUE. D1 mặc định thực thi foreign keys; migration dùng FK và index cho những truy vấn chính.

Tạo order + items trong một `db.batch()` nguyên tử. Trigger kiểm tra lại giá/tên/tồn kho ngay lúc insert items và trừ stock. Nếu bất kỳ item không hợp lệ, toàn bộ batch rollback. Token checkout hỗ trợ retry cùng yêu cầu mà không tạo đơn thứ hai. Khi đơn PENDING hết hạn, đổi EXPIRED/CANCELLED và trả stock đúng một lần. Expiry chạy khi đọc catalog, trạng thái, danh sách admin hoặc tạo đơn; không cần cron trả phí. Đơn được giữ lại trong D1.

Trigger `settle_payment` gắn payment vào đơn duy nhất nếu trạng thái còn PENDING, chưa hết hạn, đúng số tiền, bank và account. Transaction ID unique + insert conflict-do-nothing ngăn webhook retry. Giao dịch thừa/thiếu tiền, sai bank/account, đơn hết hạn/đã trả tiền hoặc không khớp được lưu REVIEW. Hai payment khác ID cho cùng đơn chỉ có một payment được MATCHED. Thời hạn được xét theo **lúc server nhận webhook**; webhook tới trễ cần admin đối soát, kể cả nếu khách chuyển trước hạn.

## Chạy local

Cài Node.js 22.16+ hoặc Node.js 24 LTS, npm và Git. Nếu Windows không nhận `node`, thêm thư mục chứa `node.exe` vào PATH rồi mở terminal mới. OpenNext khuyến nghị WSL/Linux khi gặp lỗi build trên Windows; không cần đổi code.

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run db:seed
npm run dev
```

PowerShell dùng `Copy-Item .dev.vars.example .dev.vars` thay `cp` nếu cần. Mở `http://localhost:3000`. D1 local được lưu trong `.wrangler/state`, không cần tài khoản Cloudflare; `YOUR_DATABASE_ID` là placeholder và chỉ phải thay trước thao tác remote. Không commit `.dev.vars`, `.env*` hay `.wrangler`.

Catalog chỉ đọc D1, không có dữ liệu giả fallback. Seed tạo Original 22.000đ, Chocolate 22.000đ, Matcha 24.000đ, Mixed 22.000đ, mỗi gói 3 cookies. Seed dùng ON CONFLICT DO NOTHING nên không ghi đè thay đổi giá/stock đang có. Stock 100 là dữ liệu khởi tạo local: **cập nhật tồn kho thực tế trước mở bán**.

Checkout từ chối tạo đơn nếu ngân hàng hoặc webhook secret chưa được cấu hình. Để thử thanh toán, điền thông tin **SePay Test Mode** của bạn vào `.dev.vars`; không dùng tài khoản giả cho giao dịch thật.

## Biến môi trường

| Biến | Giá trị cần cấu hình / nguồn |
|---|---|
| `PAYMENT_PROVIDER` | `sepay` |
| `SEPAY_BANK_CODE` | `VCB`, `TCB`, `MB`; cũng hỗ trợ vietcombank, techcombank, mbbank |
| `SEPAY_BANK_ACCOUNT` | Số tài khoản nhận tiền đã kết nối trong SePay; lấy từ ngân hàng / SePay |
| `SEPAY_ACCOUNT_HOLDER` | Tên chủ tài khoản tương ứng |
| `SEPAY_WEBHOOK_AUTH` | `hmac` (mặc định) hoặc `apikey`, trùng cấu hình trong SePay |
| `SEPAY_WEBHOOK_SECRET` | Secret HMAC hoặc API key webhook, tối thiểu 24 ký tự, tạo trong SePay |
| `SITE_URL` | Origin thật, ví dụ `https://cookies.your-domain.vn`; local `http://localhost:3000` |
| `STORE_LAT`, `STORE_LNG` | Vĩ độ / kinh độ chính xác của điểm lấy bánh Mildkin tại NEU. Bắt buộc cho DELIVERY; PICKUP không cần. |
| `CF_ACCESS_TEAM_DOMAIN` | Team domain dạng `your-team.cloudflareaccess.com` trong Zero Trust |
| `CF_ACCESS_AUD` | Application Audience (AUD) từ ứng dụng Access bảo vệ admin |

Không cần SePay API token cho luồng webhook này. `SEPAY_WEBHOOK_SECRET` là credential xác thực **webhook**, không phải API token gọi REST SePay. Không có `ADMIN_SECRET`: dùng Cloudflare Access và kiểm chứng JWT tại server.

Phí ship nằm trong `lib/shipping.ts`: Haversine từ STORE_LAT/STORE_LNG đến tọa độ khách, tính phí bằng khoảng cách chưa làm tròn. 0–2 km: 0đ; trên 2–4: 10.000đ; trên 4–6: 15.000đ; trên 6–7: 20.000đ; trên 7–dưới 8: 25.000đ; từ 8 km: chỉ PICKUP (0đ). Không dùng dịch vụ bản đồ trả phí.

Khách nhập địa chỉ, phường/xã, quận/huyện, Hà Nội rồi bấm “Tính phí giao hàng”. Browser gửi 4 trường đến POST /api/shipping/quote; backend gọi Geoapify, chọn kết quả phù hợp ở Hà Nội rồi tính Haversine và phí. Khi tạo DELIVERY order, server gọi geocoding mới và tính lại khoảng cách/phí/total, bỏ qua tọa độ/phí/khoảng cách frontend. PICKUP không gọi geocode. Đổi địa chỉ làm vô hiệu quote.

Điền STORE_LAT và STORE_LNG trong `.dev.vars` khi phát triển. Production: Cloudflare Dashboard → Workers & Pages → mildkin → Settings → Variables and Secrets, thêm hai biến với tọa độ thật (số thập phân dùng dấu chấm). Hoặc thêm giá trị thật vào `vars` trong wrangler.jsonc trước deploy. Không có giá trị giả định. Thiếu/sai config chặn DELIVERY nhưng vẫn cho PICKUP.

Trước deploy phiên bản này, chạy `npm run db:migrate:remote` để áp dụng migration mới `0003_cultured_star_brand.sql`. Không sửa migration cũ. Đơn cũ giữ nguyên tiền ship và tổng, mặc định DELIVERY, khoảng cách NULL nên không hiển thị khoảng cách. Local dùng `npm run db:migrate:local`.

Geoapify gọi server-side qua HTTPS/global fetch, timeout 8 giây, không theo redirect, không autocomplete. Xét tối đa 5 kết quả, ưu tiên Việt Nam/Hà Nội, quận phù hợp, city confidence và khoảng cách tới NEU. Chấp nhận street/suburb phù hợp khi thiếu building; từ chối tâm thành phố/quốc gia. Chỉ gửi địa chỉ, không gửi tên/điện thoại/email/ghi chú. Không log query, API key hoặc response body. Giới hạn quote/checkout hiện có vẫn áp dụng.

Cần `GEOAPIFY_API_KEY` ở server: local điền trong `.dev.vars` (xem `.dev.vars.example`); production chạy `npx wrangler secret put GEOAPIFY_API_KEY` rồi `npm run deploy`. Không đưa key vào wrangler.jsonc hoặc NEXT_PUBLIC_*. Giữ STORE_LAT=21.000127 và STORE_LNG=105.843153; bias lấy từ shippingConfig(env), longitude trước latitude. Không cần migration mới. Chi tiết: SHIPPING-IMPLEMENTATION.md.

## Cloudflare D1 và migration

```bash
npx wrangler login
npx wrangler d1 create mildkin-db
```

Copy database ID thật từ output (hoặc Workers & Pages → D1 → database) vào `d1_databases[0].database_id` trong `wrangler.jsonc`. Tên database `mildkin-db`, binding **DB**. Không cần username/password.

```bash
npm run db:generate
npm run db:migrate:local
npm run db:seed
npm run db:migrate:remote
npm run db:seed:remote
```

Chỉ chạy `db:generate` khi thay đổi schema; migration sẵn trong repo không cần generate lại. Wrangler áp dụng các file `.sql` trong `drizzle/`. Trigger nghiệp vụ được thêm bằng custom Drizzle migration, không được xóa khi đổi schema. Migration mới phải được thử local trước remote.

Quản lý sản phẩm bằng D1 Console hoặc câu SQL parameterized qua công cụ quản trị của chủ shop. Ví dụ trong D1 Console:

```sql
UPDATE products SET price=24000, updated_at=unixepoch()*1000 WHERE slug='original';
UPDATE products SET active=0, updated_at=unixepoch()*1000 WHERE slug='matcha';
UPDATE products SET stock=50, updated_at=unixepoch()*1000 WHERE slug='mixed';
UPDATE products SET image_url='/images/original-real.webp', updated_at=unixepoch()*1000 WHERE slug='original';
```

`stock` là số gói **còn có thể bán**, đã trừ các đơn đang giữ chỗ; cân nhắc đơn đang giữ khi điều chỉnh kiểm kê. Thay ảnh bằng file mới trong `public/images` và sửa `image_url`. Schema cho phép thêm flavor/seasonal; hiện chưa có UI chỉnh sản phẩm, theo phạm vi admin đơn hàng của MVP.

## Kiểm thử / build

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run build:cloudflare
npm run preview
```

`preview` build OpenNext rồi chạy Wrangler/workerd (thường cổng 8787). Khi kiểm tra checkout ở cổng này, đặt `SITE_URL=http://localhost:8787`. `npm run dev` dùng `initOpenNextCloudflareForDev` để có cùng D1 local binding.

Unit tests bao phủ currency, code, tổng tiền, shipping, QR, strict matching, amount và HMAC raw-body/timestamp. Integration test Miniflare dùng migration thật, kiểm tra 7 trường hợp webhook yêu cầu, rollback, tồn kho, race, idempotency checkout, sai tài khoản/ngân hàng, expiry và tiền tới muộn. Tài khoản trong test chỉ là fixture, không dùng ngoài test.

## SePay: Test Mode và production

Tài liệu chính thức: [webhook](https://docs.sepay.vn/tich-hop-webhooks.html), [HMAC/API key](https://developer.sepay.vn/en/sepay-webhooks/xac-thuc), [Test Mode](https://docs.sepay.vn/test-mode.html), [OpenNext Cloudflare](https://opennext.js.org/cloudflare/get-started).

1. Tạo tài khoản SePay. Bật **Test Mode** trong dashboard, tạo tài khoản ngân hàng test; dữ liệu test và live tách biệt.
2. Điền code ngân hàng, số tài khoản test và tên chủ tài khoản vào `.dev.vars`. QR được tạo tự động tại `https://qr.sepay.vn/img`, với bank, acc, amount và des=mã đơn. Không nhập số tiền/QR cố định vào UI.
3. Tạo webhook Test Mode: sự kiện **Có tiền vào**, chọn đúng tài khoản, JSON payload, bật retry. URL là `https://PUBLIC_HOST/api/webhooks/sepay`. Nếu lọc mã thanh toán, prefix `MK`, toàn mã dài 12 ký tự; không cắt mất 10 ký tự sau MK.
4. Chọn HMAC-SHA256; lưu secret vào `SEPAY_WEBHOOK_SECRET`, đặt `SEPAY_WEBHOOK_AUTH=hmac`. App kiểm tra `X-SePay-Signature: sha256=<hex>` trên `${timestamp}.${raw_body}`, nhận timestamp trong khoảng ±5 phút, dùng Web Crypto. Không parse/stringify trước khi verify. Nếu chọn API Key, đặt auth `apikey`, sử dụng `Authorization: Apikey <secret>` chính xác theo SePay.
5. Expose local: cài Cloudflare Tunnel, chạy `cloudflared tunnel --url http://localhost:3000` song song với `npm run dev`. Quick Tunnel cung cấp URL public tạm thời. `wrangler dev` riêng nó **không** làm localhost public. Điền URL tunnel thật vào SePay. Muốn checkout qua tunnel, đổi `SITE_URL` sang origin tunnel và mở shop bằng origin đó; không dùng localhost trong webhook production.
6. Đặt một đơn trong browser. Sao chép mã và số tiền thực tế. Trong dashboard Test Mode, mô phỏng giao dịch **tiền vào** đúng số tài khoản, amount=order.total, content=mã đơn. Không chuyển tiền thật trong bước này.
7. Kiểm tra SePay delivery log trả HTTP 200 với `{"success":true}`. Kiểm tra D1 `orders.payment_status='PAID'` và payment `MATCHED`; payment page tự chuyển success. Gửi lại cùng transaction ID và xác nhận chỉ có 1 payment. Thử sai amount và xác nhận đơn vẫn PENDING, payment REVIEW.
8. Trước live, kết nối ngân hàng thật theo hướng dẫn SePay; dùng webhook/secret riêng cho live, thay biến môi trường, tạo đơn mới và kiểm tra lại QR. Không sao chép dữ liệu test vào D1 live.
9. Thử một thanh toán nhỏ thật sau khi HTTPS, Access, ngân hàng và webhook live hoàn tất. Kiểm tra cả số tiền vào sao kê, payment ID và trạng thái D1. Nếu QR/delivery không đúng, chưa mở bán.

SePay gửi tiền thiếu/thừa vẫn được lưu để đối soát tại `/admin/payments`; xử lý liên hệ/hoàn tiền qua quy trình của shop, không có nút tùy tiện sửa giao dịch. Webhook đến trễ, không khớp, hoặc khách chuyển hai lần cũng nằm tại đây. Giữ nhật ký tài chính trong D1 theo chính sách lưu trữ của shop, giới hạn quyền Cloudflare; không log payload chứa PII/secret ra console.

## Bảo vệ admin bằng Cloudflare Access

1. Thêm custom domain cho Worker, thiết lập DNS/HTTPS.
2. Zero Trust → Access → Applications → Add application → Self-hosted.
3. Bảo vệ cả đường dẫn **`/admin` và `/admin/*`**, và **`/api/admin/*`** trên domain. Chỉ allow email chủ shop / nhóm quản trị. Không tạo policy Bypass/Everyone.
4. Lấy Application AUD và team domain, điền `CF_ACCESS_AUD`, `CF_ACCESS_TEAM_DOMAIN`. Nếu dùng nhiều ứng dụng, dùng cùng audience được cấu hình hoặc gộp các đường dẫn vào cùng một ứng dụng để AUD khớp.
5. App verify JWT RS256, issuer, audience, thời hạn qua JWKS, không chỉ tin email/header. Thiếu/sai token sẽ không trả dữ liệu dù vào bằng workers.dev; API trả 403. Không có local admin bypass.
6. Test truy cập ẩn danh `/admin`, `/admin/orders/...`, `/api/admin/orders/...`; đăng nhập bằng email được phép rồi thử chuyển PAID → PREPARING → SHIPPING → COMPLETED. Không được chuyển ngược hoặc fulfillment đơn chưa PAID.

Để kiểm tra admin trên dev, dùng hostname tunnel có Access và audience dev riêng. Không gắn Access toàn site nếu làm webhook SePay bị chặn. Tắt workers.dev route trong production nếu không dùng, nhưng vẫn giữ verify JWT trong code.

## Deploy

Nâng cấp tài khoản khách hàng trên database đang có dữ liệu: xem [hướng dẫn auth và migration 0002](docs/customer-auth.md). Không chạy lại seed remote khi nâng cấp.

Sau khi tạo DB, thay ID, migrate/seed remote và cấu hình Access/domain:

```bash
npx wrangler secret put SEPAY_BANK_CODE
npx wrangler secret put SEPAY_BANK_ACCOUNT
npx wrangler secret put SEPAY_ACCOUNT_HOLDER
npx wrangler secret put SEPAY_WEBHOOK_AUTH
npx wrangler secret put SEPAY_WEBHOOK_SECRET
npx wrangler secret put SITE_URL
npx wrangler secret put CF_ACCESS_TEAM_DOMAIN
npx wrangler secret put CF_ACCESS_AUD
npm run deploy
```

Các biến không nhạy cảm cũng có thể đặt trong `vars` của Wrangler. Secrets production nhập qua prompt Wrangler, không paste vào code/chat. `.dev.vars` chỉ dùng local. Nếu tài khoản chưa có Worker `mildkin`, tạo Worker trống tên đó qua Dashboard trước khi thêm secrets hoặc triển khai build lần đầu; checkout vẫn fail closed khi thiếu config. Cập nhật `vars` phí ship/tọa độ rồi deploy nếu thay đổi.

`npm run deploy` build adapter rồi deploy Worker + static assets. Không cần PostgreSQL, R2 hoặc dịch vụ bản đồ. Catalog và order render động, không dùng ISR/R2 cache; assets tĩnh qua Cloudflare CDN. API nhạy cảm trả `private, no-store`. Có thể bổ sung Cloudflare WAF/rate rules theo lưu lượng thực tế; đừng cache các path `/api/*`, `/orders/*`, `/admin/*`.

Tham khảo [OpenNext](https://opennext.js.org/cloudflare) về `nodejs_compat`; không đặt `runtime='edge'` cho route này. Business logic dùng Fetch/Web Crypto, không phụ thuộc Node crypto hay TCP database driver.

## Ảnh, SEO và mở rộng

Ảnh menu do chủ shop cung cấp: tho.png → Original, mèo.png → Chocolate, gấu.png → Matcha, mix.png → Mixed; trangchu.png cho ảnh đầu trang. Avatar giữ từ ava_mildkin.PNG. Bản gốc được lưu trong public/images; chạy node scripts/optimize-images.mjs để tạo WebP. Nền giao diện chỉ dùng trắng, xanh #89B876 / #7DA76B / #314822 và hồng #FAB6B6; màu trong ảnh gốc được giữ nguyên. Font Be Vietnam Pro được lưu nội bộ, giấy phép tại public/fonts/OFL.txt.

Metadata, Open Graph text, favicon, robots và sitemap đã có; `SITE_URL` phải đúng domain. Chưa cài analytics/Meta Pixel hay dịch vụ trả phí. Nếu cần analytics, thêm component riêng vào root layout sau khi quyết định cơ chế đồng ý phù hợp.

## Checklist trước nhận tiền thật

- [ ] Có Cloudflare account và Worker.
- [ ] Tạo D1 database, điền database ID thật (không dùng placeholder).
- [ ] Apply remote migrations, seed, xác nhận đúng giá/stock thực tế.
- [ ] Custom domain và HTTPS hoạt động; SITE_URL đúng origin.
- [ ] Tạo SePay account, kết nối đúng ngân hàng thật.
- [ ] Webhook tiền vào đúng URL/account, JSON và retry được bật.
- [ ] Webhook authentication và secrets production đầy đủ.
- [ ] VietQR đúng bank/account/amount/order code; kiểm tra tên người nhận trong app ngân hàng.
- [ ] Test Mode: đúng tiền, sai tiền, trùng webhook, hết hạn đã thử.
- [ ] Thanh toán nhỏ thật đã thử và order tự thành PAID.
- [ ] Access bảo vệ cả admin UI/API, JWT audience đúng, email allowlist đúng.
- [ ] Thử fulfillment và giao dịch cần đối soát trong admin.
- [x] Thay ảnh minh họa bằng ảnh bánh và avatar thật do chủ shop cung cấp.
- [ ] Rà thông tin dị ứng/ship/liên hệ thực tế.
- [ ] Kiểm tra mobile 375px, desktop, bàn phím, checkout và QR.
- [ ] Lint, typecheck, tests, OpenNext production build và preview pass.
- [ ] Thiết lập quy trình đối soát, hoàn tiền, kiểm kê và quyền truy cập/backup D1.

Không thể tự cấu hình tài khoản ngân hàng, credentials SePay, D1 ID hoặc domain khi chưa có quyền/tài khoản của chủ shop. Repository không chứa các giá trị thật này.
