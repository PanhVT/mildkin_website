# Xóa duy nhất một đơn test đã xác nhận

Ngày kiểm tra: 15/10/2026. Không có remote query hoặc remote delete nào được chạy.
D1 local hiện không có đơn hàng (query latest trả `[]`), do đó chưa có ID, mã đơn,
created_at, trạng thái hoặc child records thực tế của đơn remote để báo cáo.
Local hiện mới áp dụng migration 0000–0007; repo có đến 0010. Không tự migrate local
hay remote trong tác vụ này. Schema remote phải được kiểm tra riêng trước khi xóa.

## Schema và stock

- Chọn đơn mới nhất bằng `ORDER BY created_at DESC,id DESC LIMIT 1`.
  `created_at` là Unix milliseconds, ID là thứ tự phụ ổn định khi trùng timestamp.
- `order_items.order_id` và `payments.order_id` tham chiếu `orders.id`, ON DELETE
  NO ACTION: xóa items, payments trước, orders sau. `orders.user_id` trỏ sang users;
  xóa order không xóa user. `paid_payment_id` không có FK trong schema hiện tại.
- Delivery được lưu ngay trong orders: delivery_assignee, delivery_status,
  assigned_at, delivery_started_at, delivered_at (migration 0009).
  Instagram và instagram_contacted_at cũng ở orders (0010). Không có bảng
  email/contact/delivery riêng trong repo, không có child FK nào khác tới orders.
  Script precheck in toàn bộ CREATE TABLE/trigger và PRAGMA FK của ba bảng liên quan;
  phải đọc các CREATE TABLE khác để phát hiện child FK triển khai thêm ngoài repo.
- `reserve_item`: BEFORE INSERT order_items, trừ stock.
  `release_reservation`: AFTER UPDATE OF status orders, hoàn stock khi hủy đủ điều kiện.
  `settle_payment`: AFTER INSERT payments, cập nhật thanh toán/order.
  Không có trigger DELETE trong migration 0000–0010 hoặc D1 local đã kiểm tra.
- DELETE trực tiếp không thay đổi stock và cũng KHÔNG hoàn reservation của đơn pending.
  File này chủ ý giữ nguyên stock, không UPDATE status/CANCELLED và không UPDATE products.
  Nếu muốn hoàn số lượng test đã giữ, đó là một thao tác inventory riêng cần rà soát;
  không tự cộng stock. Nếu remote có DELETE trigger hoặc FK khác, dừng và đánh giá lại.
- Đơn PAID, COMPLETED hoặc có dấu hiệu đơn thật phải được cảnh báo và người vận hành
  xác nhận rõ là test trước khi tiếp tục. Không mặc định đơn mới nhất là đơn test.

## 1. Remote precheck chỉ đọc (bạn tự chạy)

Từ thư mục project, xem đơn mới nhất cùng số child records:

```powershell
npx wrangler d1 execute mildkin-db --remote --command="SELECT id,order_code,customer_name,created_at,datetime(created_at/1000,'unixepoch','+7 hours') AS created_at_vietnam,status,payment_status,payment_method,total,(SELECT COUNT(*) FROM order_items WHERE order_id=orders.id) AS item_rows,(SELECT COUNT(*) FROM payments WHERE order_id=orders.id) AS payment_rows FROM orders ORDER BY created_at DESC,id DESC LIMIT 1;"
```

Precheck chi tiết (vẫn chỉ đọc): liệt kê từng item/payment ID, schema, tất cả FK tới
orders, triggers và stock hiện tại. Giữ kết quả làm baseline, không chia sẻ token/secret.

```powershell
$singleOrderPrecheck = ((Get-Content -Raw scripts/inspect-latest-test-order.sql) -replace '(?m)--[^\r\n]*','') -replace '\r?\n',' '
npx wrangler d1 execute mildkin-db --remote --command "$singleOrderPrecheck"
```

Nếu các cột này đã có trong schema remote, xem delivery/contact bằng exact ID:

```sql
SELECT id,order_code,delivery_assignee,delivery_status,assigned_at,
       delivery_started_at,delivered_at,customer_instagram,instagram_contacted_at
FROM orders WHERE id='ID_DA_XAC_NHAN' AND order_code='MA_DA_XAC_NHAN';
```

Chốt đúng ID + order code từ kết quả; các payments unmatched có order_id NULL hoặc
thuộc đơn khác được giữ nguyên. Danh sách items_to_review/payments_to_review chính
là các child records sẽ xóa. Không dùng lại một subquery latest trong lệnh DELETE.

## 2. Chuẩn bị file ghim ID/code (chưa thực thi)

Sau khi đã kiểm tra mã đơn và xác nhận đây là test, thay hai chuỗi sau bằng giá trị
thực tế. Generator chỉ ghi file offline, không kết nối D1 và không chạy Wrangler.

```powershell
node scripts/prepare-order-deletion.mjs "ID_DA_XAC_NHAN" "MA_DA_XAC_NHAN"
```

Generator tạo `scripts/delete-confirmed-test-order.sql` và
`scripts/verify-confirmed-test-order.sql`; từ chối ghi đè file đã tồn tại.
Mã đơn phải đúng định dạng MK + 10 ký tự hex viết hoa. ID được escape SQL literal.
Mở file xóa và kiểm tra từng WHERE trước khi chạy. `delete-latest-test-order.sql`
là template với placeholder không khớp đơn thật, không phải file remote sẵn dùng.

## 3. Lệnh xóa remote (chỉ cung cấp, chưa chạy)

Giữ yên các thao tác checkout/payment/seller trong khoảng precheck–delete–verify
để không có callback hoặc status update đồng thời. Kiểm tra lại exact ID/code,
status/payment, child IDs và baseline stock ngay trước khi chạy.

```powershell
npx wrangler d1 execute mildkin-db --remote --file=scripts/delete-confirmed-test-order.sql
```

File có đúng ba DELETE: order_items, payments, orders. Cả ba được giới hạn bằng
cùng ID + order code, không xóa products/users hoặc các đơn khác. Không tắt FK,
không thêm BEGIN/COMMIT, không chạy từng DELETE bằng ba lệnh Wrangler độc lập.

Wrangler 4.142.0 local thực thi file bằng D1 batch, rollback cả batch nếu lỗi.
Remote --file dùng D1 import flow, thông báo database trở về trạng thái ban đầu
nếu thực thi thất bại. Đã kiểm tra implementation Wrangler được cài trong project.
D1 batch transaction: https://developers.cloudflare.com/d1/worker-api/d1-database/#batch
D1 import không dùng BEGIN/COMMIT: https://developers.cloudflare.com/d1/best-practices/import-export-data/

## 4. Verify remote chỉ đọc

```powershell
$singleOrderVerify = ((Get-Content -Raw scripts/verify-confirmed-test-order.sql) -replace '(?m)--[^\r\n]*','') -replace '\r?\n',' '
npx wrangler d1 execute mildkin-db --remote --command "$singleOrderVerify"
```

Expected order_count/order_code_count/item_count/payment_count đều 0;
foreign_key_check trả rỗng. So sánh toàn bộ `(id,name,stock)` với baseline: không đổi.
Tổng orders giảm đúng 1, users giữ nguyên. Các record thuộc đơn khác giữ nguyên.

## Local test result

`npm run test -- --pool=forks --reporter=verbose tests/delete-single-order.test.ts`
đã pass 2 tests trên D1 Miniflare tạm với toàn bộ migrations 0000–0010, không ghi
vào D1 local hiện có hoặc remote. Bao phủ pending, preparing, completed/paid,
cancelled; hai orders trùng timestamp; template chưa điền/wrong code không xóa;
đúng ID/code xóa một đơn và children; products/users/stock giữ nguyên; retry không
xóa đơn khác; child FK bổ sung gây lỗi thì rollback cả items/payments/order.
Các trường hợp paid/completed chỉ là fixture kiểm thử, không phải quyền tự xóa remote.
