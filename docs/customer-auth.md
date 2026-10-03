# Tài khoản khách hàng Mildkin

## Phạm vi và file

Mới: `lib/auth/{password,session,current-user,user,validation,rate-limit,handler,orders}.ts`; `components/auth/{auth-form,profile-form,logout-button,order-history}.tsx`; các trang `/register`, `/login`, `/account`, `/account/orders`, `/account/orders/[orderCode]`; API `/api/auth/{register,login,logout,session}` và `/api/account/profile`; `tests/auth.test.ts`.

Sửa: `db/schema.ts`, `lib/orders/service.ts`, `app/api/orders/route.ts`, `app/layout.tsx`, `components/layout/header.tsx`, `app/checkout/page.tsx`, `components/checkout/checkout-form.tsx`, `app/globals.css`, `app/robots.ts` và README. Migration mới: `drizzle/0002_fine_norrin_radd.sql`, snapshot và journal tương ứng.

Chuyển `app/loading.tsx` xuống `app/menu/loading.tsx` để account không stream HTTP 200 trước khi kiểm tra session/quyền sở hữu; HTTP smoke xác nhận redirect 307 và not-found 404.

## Dữ liệu và bảo mật

- `users`: email chuẩn hóa có unique index, tên, điện thoại nullable, password hash/salt và timestamps.
- `sessions`: FK user có ON DELETE CASCADE, SHA-256 token hash unique, expiry, created/last-seen; index theo user và expiry.
- `orders.user_id`: FK nullable có index. Đơn cũ và guest giữ NULL; không tự nhận đơn cũ qua email/điện thoại.
- Mật khẩu PBKDF2 SHA-256 qua Web Crypto, salt ngẫu nhiên 32 byte, 100.000 vòng, output 32 byte. Hash lưu tên thuật toán/cost. Cost hiện chọn theo giới hạn workerd và được test trong Miniflare; cần đánh giá lại cost khi runtime hỗ trợ cao hơn.
- Token session ngẫu nhiên 32 byte, chỉ hash nằm trong D1. Cookie `mildkin_session`: HttpOnly, SameSite=Lax, Path=/, Max-Age=2592000, Secure trong production. Hạn cố định 30 ngày; lastSeen không gia hạn. Không lưu auth vào localStorage.
- Register tạo user và session cùng transaction; đăng nhập thay session của trình duyệt hiện tại. Logout xóa session D1 và hết hạn cookie. Session hết hạn không được xác thực; endpoint session dọn cookie; login/register dọn bản ghi hết hạn.
- Mọi mutation kiểm tra Origin theo SITE_URL. D1 request_limits giới hạn login 30/IP và 10/email mỗi 15 phút; register 5/IP và 10/email mỗi giờ. Sai email/mật khẩu trả thông báo chung. Không log thông tin mật khẩu.
- Account và history kiểm tra session phía server. Detail lọc đồng thời mã đơn và user_id, trả 404 cho đơn của người khác. Không trả password, token, internal ID hay raw payment payload cho UI.
- Customer auth không cấp quyền admin; Cloudflare Access của admin giữ nguyên.

Tham khảo giới hạn runtime: https://github.com/cloudflare/workerd/issues/1346 và https://developers.cloudflare.com/workers/runtime-apis/web-crypto/.

## Luồng sử dụng

Đăng ký thành công đến `/account`. Đăng nhập nhận `next` theo allowlist (ví dụ `/checkout`); mặc định `/account`. Navbar đổi theo session. Profile chỉ sửa tên/điện thoại, email không đổi trong MVP.

Checkout tự điền tên/điện thoại nhưng cho sửa từng đơn. Backend lấy user từ cookie đã kiểm tra, bỏ qua userId trong body. Guest vẫn đặt bánh và xem đơn bằng access token hiện có. Retry cùng checkoutToken không đổi chủ sở hữu đơn. Payment matching, SePay webhook và inventory triggers giữ nguyên.

Chưa có xác minh email, quên/đổi mật khẩu hay đăng xuất tất cả thiết bị trong MVP này.

## Triển khai sau khi review

Không cần AUTH_SECRET, KV, Durable Objects hay env mới. SITE_URL hiện có phải khớp HTTPS origin production; local dùng `SITE_URL=http://localhost:3000` trong `.dev.vars`. Không cache các trang account hoặc API auth ở CDN.

Migration 0002 chỉ tạo bảng/index và thêm cột nullable; không sửa migration cũ, không xóa dữ liệu hoặc chạy seed trên database đang bán hàng.

Chỉ chạy các lệnh sau khi chủ shop review, xác nhận đúng tài khoản Cloudflare/database và có bản sao lưu production:

```powershell
npx wrangler d1 export mildkin-db --remote --output=./mildkin-before-auth.sql
npx wrangler d1 migrations list mildkin-db --remote
npm run db:migrate:remote
npm run deploy
```

File export chứa dữ liệu khách hàng: giữ riêng ngoài Git. Migration cần áp dụng trước khi deploy code mới. Không chạy `db:seed:remote` cho nâng cấp auth. Các lệnh remote/deploy trên chưa được thực hiện bởi agent.

## Kiểm tra

```powershell
npm run db:migrate:local
npm run typecheck
npm run lint
npm run test
npm run build
npm run build:cloudflare
npm run dev
```

1. Mở `/account` khi chưa đăng nhập: chuyển `/login?next=...`.
2. Tạo tài khoản tại `/register`, thử bỏ trống điện thoại, mật khẩu không khớp, email đã tồn tại. Thành công: navbar Tài khoản, profile và lịch sử trống.
3. Sửa tên/điện thoại, lưu, tải lại. Email không chỉnh được.
4. Thêm bánh rồi `/checkout`: thông tin đã điền, vẫn sửa được. Tạo đơn local bằng cấu hình thanh toán test; xem tại `/account/orders` và trang chi tiết.
5. Đăng xuất, đăng nhập sai và đúng; dùng `/login?next=/checkout` kiểm tra quay lại checkout. Khi logout, account lại yêu cầu login.
6. Tài khoản B thử URL đơn của A: 404, history không lộ đơn A. Guest tạo đơn vẫn xem bằng cơ chế access token, user_id NULL.
7. DevTools cookie: HttpOnly, Lax, Path=/; production có Secure. Token không có trong localStorage hoặc JSON API; D1 chỉ có token_hash.
8. Kiểm tra navbar/form/account ở 375px, 768px và desktop, bàn phím và thông báo lỗi. Test Mode SePay và admin Access dùng quy trình riêng hiện có; không chuyển tiền thật cho thử nghiệm auth.

Tests tự động bao phủ password, session expiry/rotation/logout, duplicate registration, login, cookie, CSRF, rate limits, profile isolation, owner từ session, guest/legacy orders, stock và payment regressions.
