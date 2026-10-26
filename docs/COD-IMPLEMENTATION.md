# COD / Thanh toán khi nhận bánh — báo cáo triển khai

Ngày: 12/10/2026. Đã hoàn tất code, kiểm thử và apply migration **local**. Chưa apply remote migration, chưa deploy production.

## 1. Files mới

- `lib/payments/method.ts`: enum dùng chung, nhãn theo hình thức nhận hàng và đường dẫn sau đặt đơn.
- `components/checkout/payment-options.tsx`, `components/checkout/payment-options.css`: hai lựa chọn thanh toán dạng radio/card responsive.
- `lib/seller/cod.ts`: ghi nhận thu tiền COD nguyên tử, idempotent.
- `components/seller/cod-actions.tsx`: xác nhận thu tiền và hủy COD chưa thu tiền.
- `lib/seller/payments.ts`: ledger, bộ lọc và thống kê SePay/COD.
- `drizzle/0007_cod_payments.sql`, `drizzle/meta/0007_snapshot.json`: migration và metadata mới.
- `tests/cod-pages.test.ts`: xác minh UI, routing và không tạo QR cho COD.
- `docs/COD-IMPLEMENTATION.md`: báo cáo này.

## 2. Files sửa trong task

- Model/validation: `db/schema.ts`, `lib/validation.ts`, `drizzle/meta/_journal.json`.
- Tạo đơn: `lib/orders/service.ts`, `app/api/orders/route.ts`.
- Buyer: `components/checkout/checkout-form.tsx`, `app/orders/[orderCode]/payment/page.tsx`, `app/orders/[orderCode]/success/page.tsx`, `lib/auth/orders.ts`, `components/auth/order-history.tsx`, `app/account/orders/[orderCode]/page.tsx`.
- Seller: `lib/seller/data.ts`, `lib/seller/handler.ts`, `components/seller/ui.tsx`, `app/seller/(dashboard)/orders/[id]/page.tsx`, `app/seller/(dashboard)/payments/page.tsx`, `components/seller/revenue-dashboard.tsx`.
- Admin: `app/admin/orders/[orderCode]/page.tsx` để hiển thị phương thức và không hiện hạn thanh toán giả cho COD.
- Tests: `tests/seller.test.ts`, `tests/d1.test.ts`, `tests/auth.test.ts`.

Giữ các thay đổi đã tồn tại trong workspace. Không sửa historical migration, sản phẩm/R2, pack_label, cart validation, thuật toán shipping hoặc màu series revenue vừa chỉnh ở task trước.

## 3. DB field / migration

`orders.payment_method TEXT NOT NULL DEFAULT 'BANK_TRANSFER'`, có CHECK chỉ nhận BANK_TRANSFER/COD. Default backfill đơn cũ thành BANK_TRANSFER mà không đổi tiền, trạng thái, tài khoản ngân hàng hay lịch sử payment.

Migration 0007 thay phiên bản hai trigger bằng DROP/CREATE trong file mới:

- `release_reservation`: giữ hủy bank-transfer như cũ; bổ sung hoàn stock cho COD chưa thu tiền, chỉ khi status chuyển sang CANCELLED lần đầu.
- `settle_payment`: nhánh SePay chỉ áp dụng BANK_TRANSFER; nhánh COD chỉ áp dụng receipt provider cod có đúng tổng tiền và khóa `cod:<orderId>`. COD không bị chuyển lùi trạng thái giao hàng khi thu tiền.
- `reserve_item` giữ nguyên.

Giữ trường `expires_at` legacy không-null cho tương thích; COD không dùng trường này để expire hoặc hiển thị countdown.

## 4. Values / source of truth

API input `paymentMethod`: `BANK_TRANSFER` hoặc `COD`, validate bằng Zod. Bỏ qua field trạng thái, số tiền, provider giả từ frontend. Khi client cũ bỏ paymentMethod, default BANK_TRANSFER.

Phương thức thanh toán tách biệt với `payment_status` (`PENDING`, `PAID`, ... như hiện tại). Không thêm payment/order status mới.

## 5. BANK_TRANSFER flow

Create order → PENDING_PAYMENT/PENDING → reserve stock → trang payment QR/thông tin ngân hàng → SePay webhook insert payment → trigger kiểm tra provider, bank/account, amount, trạng thái và hạn → payment PAID và order PREPARING trong cùng batch D1. Logic QR giữ nguyên.

Response create-order có thêm `paymentMethod` và `redirectTo` lấy từ đơn đã lưu. Retry cùng checkoutToken giữ phương thức gốc và không reserve lần hai.

## 6. COD flow

Create order → `payment_method=COD`, `status=PENDING_PAYMENT` (Chờ xác nhận), `payment_status=PENDING`, `paid_at=NULL`. Stock vẫn reserve bằng trigger cũ. Không tạo payment record lúc này, không cần cấu hình SePay, không gọi QR/bank instruction.

Buyer được chuyển thẳng sang `/orders/<code>/success`: “Đặt bánh thành công ♡”, mã đơn, tổng tiền, phí ship, phương thức và thông báo thu tiền khi nhận bánh. Truy cập `/payment` với COD cũng redirect trước khi tạo QR. Đơn COD đã hủy có thông báo hủy riêng, không hiện thành công.

DELIVERY: “Thanh toán khi nhận hàng”. PICKUP: “Thanh toán khi nhận bánh”. COD không có phụ phí, tính subtotal/shipping/total bằng cùng server logic như chuyển khoản. Guest và người đăng nhập đều đặt được; history lưu/hiện đúng phương thức.

## 7. Seller xác nhận COD

Tại `/seller/orders/[id]`, COD PENDING hợp lệ có nút “Xác nhận đã thu tiền”. API: `POST /api/seller/cod-payments/<id>`.

Handler gọi `requireSameOrigin()` và `requireSeller()` trước mọi ghi dữ liệu. Một `INSERT ... SELECT` đọc tổng tiền từ order và chỉ insert khi COD còn PENDING, status PREPARING/SHIPPING/COMPLETED. Receipt có `provider=cod`, transaction ID và ID duy nhất `cod:<orderId>`. Trigger cập nhật `payment_status=PAID`, `paid_at`, `paid_payment_id` và `resolution=MATCHED` nguyên tử.

Bấm lặp/đồng thời: trả trạng thái đã PAID, không tạo receipt thứ hai, không đổi paid_at. Buyer/anonymous bị 401, sai origin 403, missing 404, order chuyển khoản hoặc đã hủy bị 409. Không có electronic refund.

Seller xác nhận COD: PENDING_PAYMENT → PREPARING, payment vẫn PENDING. COD được đi PREPARING → SHIPPING khi chưa thu tiền, nhưng phải PAID trước COMPLETED. COD PENDING ở PREPARING/SHIPPING có nút hủy; hoàn stock một lần. Đã PAID không được hủy qua API hiện tại. Race thu tiền/hủy được ràng buộc trong SQL, chỉ một nhánh có thể thành công.

## 8. expireOrders

Chỉ expire `payment_method=BANK_TRANSFER AND payment_status=PENDING AND expires_at <= now`. COD không bị hết hạn do chưa thu tiền, kể cả sau 15 phút. Ngân hàng giữ nguyên timeout và hoàn stock khi hủy do hết hạn.

## 9. Revenue

Aggregation hiện tại đã bắt buộc payment_status PAID, paid_at và trạng thái đơn hợp lệ. COD PENDING không vào doanh thu/AOV/best-selling/payment received. Sau xác nhận thu tiền, COD đi vào cùng aggregation theo paid_at GMT+7, kể cả xác nhận sau khi hoàn thành giao hàng. Không nạp toàn bộ orders xuống frontend.

## 10. Payment analytics / seller payments

Revenue donut group `payments.provider` trên receipt MATCHED nối `orders.paid_payment_id`; tự có SePay và COD theo SUM amount thực. Chỉ đổi nhãn cod thành “COD”; không hard-code tỷ trọng.

`/seller/payments`: filter Tất cả / Chuyển khoản / COD, cột Phương thức. Ledger UNION ALL các payment thật với order COD chưa thu tiền (projection, không phải fake payment). Sau thu tiền, projection biến mất và thay bằng receipt thật. Đơn hủy có trạng thái hủy. KPI “Đã nhận hôm nay” chỉ SUM receipt đã khớp với đơn PAID hợp lệ; tiền REVIEW không được coi là doanh thu. Thống kê và pagination theo bộ lọc, truy vấn gộp không N+1.

Seller overview “Đơn chờ thanh toán” cũng bao gồm COD chưa thu tiền chưa hủy.

## 11. Tests

**315 tests / 16 files passed**, tăng 24 tests so với trước COD; thêm assert backfill vào test migration cũ.

Bao phủ SePay regression, default/invalid enum, guest/account COD, đúng shipping total, sold out, pending ban đầu, không QR/instructions, source of truth, reservation/release, timeout, completed-but-unpaid, thu tiền lặp và concurrent, race collect/cancel, buyer/anonymous/cross-origin isolation, SePay callback không settle COD, doanh thu trước/sau thu tiền, provider analytics, payment filters/received, account history, UI pickup/delivery và cancelled confirmation.

QA trình duyệt dùng **component checkout thật** với giỏ fixture trong server tách biệt không xử lý đặt hàng: đổi COD cập nhật summary/nút Đặt bánh, chuyển PICKUP đổi nhãn, viewport mobile 390px không tràn ngang (document 375px). Không đặt đơn hay xác nhận thu tiền production trong QA. Không coi đây là browser E2E trên production.

## 12. Build result

- `npm run typecheck`: PASS (chạy lại sau builds).
- `npm run lint`: PASS.
- `npm run test`: PASS, 315/315.
- `npm run build`: PASS.
- `npm run build:cloudflare`: PASS, `.open-next/worker.js` được tạo.

Build đầu trong sandbox có EPERM/EACCES ở log/remote dev binding; đã chạy lại ngoài sandbox thành công. Drizzle generate cũng cần chạy ngoài sandbox do lỗi đọc thông tin user hệ thống. Không đổi cấu hình app để né sandbox. Còn cảnh báo có sẵn: OpenNext hỗ trợ Windows chưa đầy đủ và Vite config loader tương lai.

## 13. Local migration

```powershell
npm run db:migrate:local
```

**Đã chạy thành công**, chỉ có migration 0007 còn pending. Kiểm tra sau đó: “No migrations to apply”. Không reset/seed lại D1 local, không sửa dữ liệu đơn/payment hiện có ngoài field default trong migration.

## 14. Remote migration — CHƯA chạy

```powershell
npm run db:migrate:remote
```

Cần apply migration trước khi deploy code mới lên môi trường đó. Script sẽ apply mọi migration còn pending trong thư mục drizzle, nên kiểm tra danh sách pending khi phát hành. Không chạy remote migration trong task này.

## 15. Deploy production — CHƯA chạy

```powershell
npm run deploy
```

Chưa deploy. Chỉ tạo build local và apply migration local.

