# Báo cáo redesign /seller/revenue

Ngày: 12/10/2026. Chỉ chỉnh khu vực doanh thu seller. Chưa deploy production; không apply remote migration.

## 1. Files sửa / thêm

- `app/seller/(dashboard)/revenue/page.tsx`: server render, seller auth, xử lý khoảng ngày không hợp lệ.
- `app/seller/(dashboard)/revenue/revenue.css`: CSS chỉ áp dụng dashboard doanh thu.
- `components/seller/revenue-dashboard.tsx`: bộ lọc, KPI, charts, bảng, loading và error states.
- `lib/seller/revenue.ts`: khoảng ngày, SQL aggregation, so sánh kỳ trước, response types.
- `lib/seller/handler.ts`: API revenue gọi aggregation mới sau `requireSeller()`.
- `tests/seller.test.ts`: thêm 11 tests với D1 Miniflare và flow checkout/webhook thật của project.
- `docs/REVENUE-REDESIGN.md`: báo cáo này.

Workspace đã có nhiều thay đổi trước task. Không sửa buyer website, navigation seller, order/payment logic, schema hoặc historical migrations.

## 2. Layout mới

4 KPI ngang; hàng chart tỷ lệ 2:1; hàng đơn gần đây / APF / thanh toán tỷ lệ 2:1:1; hàng khung giờ / tỷ lệ thanh toán 3:1. Sidebar giữ nguyên và active màu hồng. Cream, xanh đậm, hồng pastel, xanh nhạt; cards bo 20px. Tablet xếp các phần theo chiều dọc, mobile một cột. Table và timeline dài có vùng cuộn riêng. Không có mục tiêu tháng hay AOV thứ hai.

Không nhận được ảnh reference trong attachment; layout được triển khai theo đặc tả văn bản. Chưa thể xác nhận khớp pixel với reference.

## 3. Revenue chart

SVG React và CSS, không thêm dependency. Cột là doanh thu, đường là số đơn; 2 trục độc lập, legend, tooltip hover/focus/touch. Group theo ngày GMT+7, bổ sung ngày không có doanh thu bằng 0. Khoảng dài dùng vùng cuộn ngang trong chart, tối đa 366 ngày. Today cũng group theo ngày (1 cột).

## 4. Best-selling donut

`order_items JOIN orders LEFT JOIN products`, lọc đơn thành công theo `paid_at`. Doanh thu sản phẩm = `SUM(quantity * price_snapshot)`; số pack = `SUM(quantity)`. Tỷ trọng = giá trị sản phẩm / tổng tất cả sản phẩm trong kỳ. Không cắt top 10 để tránh sai mẫu số. Dropdown đổi tiêu chí, thứ tự và center total. Ảnh lấy `image_url`, lỗi hoặc thiếu ảnh dùng biểu tượng cookie Mildkin. Chỉ lấy URL, không query binary R2. Doanh thu sản phẩm không gồm phí giao hàng.

## 5. AOV

`SUM(orders.total) / COUNT(successful orders)`, bao gồm phí giao hàng như định nghĩa doanh thu hiện tại. Không có đơn: 0. Chỉ hiển thị trong KPI hàng đầu.

## 6. Average Purchase Frequency

`successful orders in range / unique purchasing customers in range`; không có khách: 0. Identity ưu tiên `user_id`, guest dùng phone đã loại khoảng trắng/dấu phân cách và đổi `+84`/`84` thành `0`. Không gửi identity/phone ra frontend. Không tự gộp tài khoản và guest theo số điện thoại.

## 7. Returning customer

Khách có ít nhất 2 đơn thành công trong kỳ đã chọn. Tỷ lệ = `returning customers / purchasing customers * 100`. Dùng cùng định nghĩa cho kỳ trước. Kỳ trước có cùng độ dài và kết thúc ngay trước kỳ hiện tại. So sánh = `(current - previous) / previous * 100`; nếu previous = 0 và current > 0: hiển thị không có cơ sở so sánh; cả hai 0: không đổi.

## 8. Repurchase cycle

`LAG(paid_at) OVER (PARTITION BY customer ORDER BY paid_at)` trên đơn thành công trong kỳ. Trung bình tất cả khoảng cách giữa hai lần mua liên tiếp, chia 86.400.000 để ra số ngày. Không có cặp mua: “Chưa đủ dữ liệu”. Các khoảng cách có trọng số theo từng cặp giao dịch, không phải trung bình của trung bình từng khách. UI ghi rõ phạm vi trong kỳ.

## 9. Payment methods

Từ `payments.provider`, nối đúng `orders.paid_payment_id = payments.id` và cùng `order_id`, chỉ `resolution = MATCHED` trên đơn thành công trong kỳ. Tổng = `SUM(payments.amount)`. Không đếm lại các giao dịch dư/trùng/chờ review. SePay có nhãn “Chuyển khoản / SePay”; provider khác chỉ xuất hiện khi DB có dữ liệu thực.

## 10. Selling hours

Lấy giờ từ `paid_at` với `+7 hours`, chia bucket 3 giờ: 0–3h ... 21–24h. D1 tính SUM doanh thu và COUNT đơn cho từng bucket; thêm bucket trống bằng 0. Dropdown doanh thu/số đơn; crown cho các bucket có giá trị lớn nhất (khi lớn hơn 0).

## 11. Metric thay conversion

“Tỷ lệ thanh toán thành công”. Project không có visits/session tracking phục vụ conversion. Mẫu số là toàn bộ đơn tạo trong kỳ (checkout hiện tại tạo đơn ở bước thanh toán); tử số là đơn thuộc chính nhóm đó đã thanh toán hợp lệ trước cuối kỳ. Giữ cùng nhóm đơn cho cả tử và mẫu, tránh dùng paid-in-period chia created-in-period dẫn đến tỷ lệ >100%. Pending/expired/cancelled vẫn thuộc mẫu số nhưng không thuộc tử số. UI ghi rõ định nghĩa. Không đồng nhất tỷ lệ này với tỷ lệ chuyển đổi truy cập.

## 12. D1 aggregation và bảo mật

Một `db.batch` gồm 8 truy vấn, snapshot nhất quán:

1. Summary kỳ hiện tại với CTE purchases/customers/intervals.
2. Summary kỳ trước.
3. Timeline group theo ngày.
4. Products group theo product_id.
5. 5 đơn thành công gần nhất + GROUP_CONCAT sản phẩm, không N+1.
6. Thanh toán group theo provider.
7. Khung giờ group theo slot.
8. Nhóm đơn tạo trong kỳ để tính tỷ lệ thanh toán.

Điều kiện doanh thu: `payment_status = PAID`, có `paid_at`, trạng thái nằm trong `PAID / PREPARING / SHIPPING / COMPLETED`. Pending, failed, expired, cancelled bị loại. API vẫn qua `requireSeller`, 401 cho anonymous và buyer session, response `private, no-store`. Page dùng `sellerPageEnv`. Các aggregation lớn không thực hiện trên frontend.

API hỗ trợ `preset=today|7d|30d|month`, hoặc `start=YYYY-MM-DD&end=YYYY-MM-DD`; vẫn nhận tham số range/from/to cũ. Khoảng ngày được resolve trên server GMT+7, đầu inclusive, cuối exclusive. UI giữ nội dung cũ, làm mờ/loading và khóa filter trong lúc fetch, hiển thị lỗi nếu request thất bại.

## 13. Migration

Không thêm migration, không đổi schema, không apply migration remote. Reuse index hiện tại và primary keys. Nếu lịch sử đơn tăng rất lớn, có thể đánh giá execution plan trước khi cân nhắc index paid_at; chưa đưa schema change vào task này.

## 14. Tests / QA

`npm run test`: **15 test files, 291 tests passed**. Trong đó 11 tests mới bao phủ aggregation, exclusions, AOV/APF, normalization, user_id, returning, chu kỳ mua lại, providers thật, snapshot items, zero data, các preset/custom, kỳ trước, múi giờ, boundaries, payment cohort, recent limit và lỗi API. Seller authorization với buyer cookie thật đã có và tiếp tục pass.

QA trình duyệt render component thật với kết quả aggregation D1 Miniflare từ test, tách khỏi production. Desktop 1600px và mobile 390px không tràn ngang toàn trang. Kiểm tra dropdown số lượng, dropdown số đơn theo giờ, tooltip timeline và ảnh placeholder. Đây là component preview, không phải kiểm thử browser đăng nhập end-to-end trên production.

Ảnh QA (số liệu kiểm thử, không phải doanh thu thật của cửa hàng): `test-results/revenue/desktop.png`, `test-results/revenue/mobile.png` (gitignored). Dataset QA chỉ xuất khi chạy test với `REVENUE_QA=1`; không có fixture trong production bundle.

## 15. Build result

- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- `npm run test`: PASS, 291/291.
- `npm run build`: PASS.
- `npm run build:cloudflare`: PASS, tạo `.open-next/worker.js`.

Lần đầu build có thông báo không ghi được log Wrangler ngoài workspace. Lần cuối đặt `WRANGLER_LOG_PATH` vào `.wrangler/logs` trong workspace và build thành công không còn lỗi ghi log. OpenNext vẫn có cảnh báo hỗ trợ Windows chưa đầy đủ; Vite có cảnh báo config loader tương lai. Không thay đổi cấu hình dự án để tắt cảnh báo.

## 16. Command deploy production — chỉ tham khảo, CHƯA chạy

```powershell
npm run deploy
```

Script hiện tại build Cloudflare rồi deploy. Không deploy và không chạy remote migrations trong task này.
