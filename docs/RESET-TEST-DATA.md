# Reset dữ liệu giao dịch Mildkin

Đã chuẩn bị và chạy LOCAL, chưa truy cập hoặc thay đổi remote. Script xóa **tất cả**
đơn/payment, không có cờ phân biệt test và thật. Chỉ sử dụng trước khi nhận đơn thật.

## Kết quả inspect

Nguồn: `db/schema.ts`, migrations `0000`–`0009`, schema/triggers/FK LOCAL thực tế,
queries trong `lib/seller/{data,revenue,preparation,delivery}.ts`.

| Bảng | Xử lý | Quan hệ |
| --- | --- | --- |
| order_items | DELETE đầu tiên | order_id → orders.id; product_id → products.id; NO ACTION |
| payments | DELETE thứ hai, kể cả order_id NULL | order_id → orders.id; NO ACTION |
| orders | DELETE cuối cùng | user_id → users.id; NO ACTION |
| products | Giữ toàn bộ rows/fields | Catalog, category, images, prices, pack_label, units_per_pack, stock |
| users | Giữ | Không thể kết luận account test chỉ từ tên/email; không xóa account |
| sessions | Giữ | user_id → users.id ON DELETE CASCADE; không xóa users nên không cascade |
| seller_sessions | Giữ | Seller auth dùng DB session riêng |
| request_limits | Giữ | Rate limits, không phải order analytics |
| d1_migrations, sqlite_sequence, _cf_METADATA | Giữ | Lịch sử migrations và metadata nội bộ |

`orders.paid_payment_id` là text liên kết logic, không khai báo FK. Không có cascade
từ orders tới items/payments; phải xóa child trước parent. Không tắt foreign keys.
Không có bảng delivery/events/webhooks/cart/checkout/analytics riêng trong schema
đã inspect. Raw webhook payload lưu trong payments; checkout dùng order/token.
Delivery assignee/status/timestamps lưu trong orders nên bị loại bỏ cùng orders.
Danh sách 7 assignee nằm trong `lib/seller/delivery-config.ts`, được giữ nguyên.

Seller/SePay/bank/webhook secrets, PAYMENT_PROVIDER, application configuration,
R2 bucket/images, schema, indexes, triggers và migrations đều không bị script tác động.

## Inventory và triggers

* `reserve_item`: BEFORE INSERT order_items; kiểm tra giá/stock, trừ stock và cập nhật updated_at.
* `release_reservation`: AFTER UPDATE OF status orders; cộng stock khi chuyển sang CANCELLED,
  nếu trước đó PENDING_PAYMENT hoặc COD chưa thanh toán, và chưa CANCELLED.
* `settle_payment`: AFTER INSERT payments; settle bank transfer/COD, UPDATE orders và payment resolution.

Không có DELETE trigger trong migrations và LOCAL thực tế. Cleanup chỉ DELETE,
không cancel order, không INSERT payment, không UPDATE products, không release reservation.
Stock hiện tại được giữ nguyên, kể cả stock đã bị test orders trừ trước đó.
`db/invariants.sql` là bản trigger cũ tham khảo; migrations (đặc biệt 0007) và
sqlite_master mới là nguồn đối chiếu khi chạy, không chạy lại invariants.sql.

Remote chưa inspect nên cần đối chiếu schema/triggers thực tế trước khi xóa.
Nếu có bảng/FK/DELETE trigger khác, dừng và điều chỉnh script theo schema đó.

## Kết quả LOCAL ngày 13/10/2026

LOCAL hiện chưa có orders trước cleanup: orders/items/payments 0 → 0; products 5 → 5;
users 3 → 3. Foreign key check sau cleanup không trả lỗi.

| Product ID | Stock trước | Stock sau |
| --- | ---: | ---: |
| chocolate | 100 | 100 |
| matcha | 100 | 100 |
| mixed | 100 | 100 |
| mixed-mystery-face | 100 | 100 |
| original | 100 | 100 |

LOCAL còn thiếu cột của migration 0008/0009; không tự apply migrations để tránh
thay đổi configuration khi cleanup. Query verify tương thích schema local cũ.
Không coi dữ liệu/stock local là dữ liệu/stock production.

Test `tests/reset-test-data.test.ts` dùng D1 Miniflare cô lập với đầy đủ migrations,
seed catalog và đơn pending bank, COD đang chuẩn bị, cancelled, completed/paid,
delivery/pickup, payment khớp và payment không có order. Test pass; chạy cleanup
hai lần và so sánh toàn bộ products/users/customer sessions/seller sessions/rate limits,
schema/triggers trước/sau. Không thay đổi R2 hoặc secrets.

Kiểm thử các query dashboard thật sau cleanup:
revenue/successful orders/AOV/customers/returning/APF đều 0; khoảng cách mua lại null
(không có lịch sử); orders rỗng; preparation rỗng; delivery KPI/workload đều 0,
7 assignee vẫn còn. UI preparation đã có “Hiện chưa có bánh nào cần chuẩn bị ♡”.
Các trang gọi D1 trực tiếp qua seller auth/cookies, không có derived/cache table
hay dữ liệu doanh thu hard-coded cần reset. Refresh các trang đang mở sau cleanup.
Đây là kiểm thử data functions, chưa xác nhận UI production sau reset.

## Lệnh chạy từ project root (PowerShell)

Wrangler cài trong project: 4.142.0; database `mildkin-db`, binding `DB`.
SQL không có BEGIN/COMMIT vì D1 quản lý transaction.

### A. Inspect, snapshot và cleanup LOCAL

```powershell
npx wrangler d1 execute mildkin-db --local --file=scripts/inspect-test-data-reset.sql
npx wrangler d1 execute mildkin-db --local --file=scripts/verify-test-data-reset.sql --json > .wrangler/reset-local-before.json
npx wrangler d1 execute mildkin-db --local --file=scripts/reset-test-data.sql
```

### B. Verify LOCAL và integration test cô lập

```powershell
npx wrangler d1 execute mildkin-db --local --file=scripts/verify-test-data-reset.sql --json > .wrangler/reset-local-after.json
Get-Content .wrangler/reset-local-after.json
npx vitest run tests/reset-test-data.test.ts
```

So sánh products đầy đủ theo id trước/sau, không chỉ tổng stock/count.
Orders/items/payments/delivery/revenue phải 0; products/users/auth counts giữ nguyên;
foreign_key_check rỗng. Nếu snapshot hoặc backup lỗi, dừng trước bước DELETE.

### C. Backup và preflight remote — người dùng tự chạy

Tạm dừng nhận đơn, seller updates, webhook/payment writers và expiry jobs trong
khoảng backup → snapshot → cleanup → verify, để không có thay đổi đồng thời.
Đây là điều kiện vận hành cần thực hiện riêng; SQL không khóa writers trên app.
Thư mục `.wrangler` đã gitignore; backup chứa dữ liệu khách hàng, giữ bản sao an toàn.

```powershell
npx wrangler d1 export mildkin-db --remote --output=.wrangler/mildkin-production-before-reset.sql
npx wrangler d1 execute mildkin-db --remote --file=scripts/inspect-test-data-reset.sql --json > .wrangler/reset-remote-schema.json
npx wrangler d1 execute mildkin-db --remote --file=scripts/verify-test-data-reset.sql --json > .wrangler/reset-remote-before.json
```

Kiểm tra exit code = 0, backup tồn tại/có nội dung, đọc preflight/schema và snapshot.
Nếu remote có thêm bảng, chạy PRAGMA foreign_key_list cho từng bảng bổ sung;
không chỉ kiểm tra bốn bảng liệt kê sẵn. Không tiếp tục nếu khác schema đã review.

### D. Cleanup remote — chỉ người dùng quyết định và tự chạy

```powershell
npx wrangler d1 execute mildkin-db --remote --file=scripts/reset-test-data.sql
npx wrangler d1 execute mildkin-db --remote --file=scripts/verify-test-data-reset.sql --json > .wrangler/reset-remote-after.json
```

Đối chiếu before/after theo tiêu chí trên rồi refresh `/seller/revenue`,
`/seller/orders`, `/seller/delivery`. Chỉ mở lại writers khi verify thành công.
Không tự reset stock mặc định; nếu cần sửa stock thật, xử lý riêng theo yêu cầu seller.

Tham khảo syntax chính thức: https://developers.cloudflare.com/d1/wrangler-commands/
và https://developers.cloudflare.com/d1/best-practices/import-export-data/.
