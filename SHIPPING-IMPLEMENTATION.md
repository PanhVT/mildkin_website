# Shipping với Geoapify

Backend `lib/geocoding.ts` gọi https://api.geoapify.com/v1/geocode/search bằng URLSearchParams: text=buildFullAddress(), format=json, filter=countrycode:vn, lang=vi, limit=5, apiKey từ env.GEOAPIFY_API_KEY. bias lấy shippingConfig(env), thứ tự longitude,latitude. Điểm gốc hiện tại vẫn STORE_LAT=21.000127 / STORE_LNG=105.843153.

`lib/geocoder-fetch.ts` dùng global fetch server-side, Accept application/json, AbortController 8 giây và clearTimeout trong finally. redirect=manual, không tự chuyển tiếp query chứa key/địa chỉ. Không axios/Node networking/GPS. Browser chỉ gọi API nội bộ.

Parse runtime bằng Zod. Bỏ ứng viên có tọa độ sai, quốc gia khác Việt Nam, không có bằng chứng thuộc Hà Nội . Không yêu cầu đủ mọi field hành chính. Chấp nhận building/amenity/street/suburb; không lấy centroid city/country. Trong tối đa 5 ứng viên hợp lệ, ưu tiên country_code vn, phường khớp ward/suburb/district, độ chính xác, confidence rồi khoảng cách tới cửa hàng. Confidence chỉ dùng xếp hạng, không tự loại địa chỉ ngõ/ngách. Field tùy chọn có thể null. Khi thiếu city/state, có thể xác nhận Hà Nội từ formatted dù county chứa tên quận. Phường/đường là vị trí ước lượng nếu không có building.

Không cache geocode: mỗi lần quote hoặc tạo đơn DELIVERY đều geocode lại trên server, gọi Geoapify Routing (motorcycle, balanced, metric) để tính quãng đường bộ/phí/total từ nguồn tin cậy. Không tin fee/distance/lat/lng client. PICKUP phí 0, không gọi geocoder, không cần địa chỉ.

Biểu phí không đổi: <=2 km miễn phí; >2–4: 10.000đ; >4–6: 15.000đ; >6–7: 20.000đ; >7–<8: 25.000đ; >=8 không giao, chọn pickup.

## Lỗi và bảo mật

GEOCODER_CONFIG: thiếu key hoặc cấu hình tọa độ sai. GEOCODER_TIMEOUT: abort/timeout. GEOCODER_NETWORK: fetch throw. GEOCODER_RATE_LIMIT: HTTP 429. GEOCODER_HTTP: HTTP khác không thành công hoặc response sai cấu trúc. ADDRESS_NOT_FOUND: không có ứng viên hợp lệ (422).

Log chỉ provider/code/status/errorName. Không log exception text, URL, key, địa chỉ, tên, điện thoại, email hoặc body. Attribution Geoapify và dữ liệu OpenStreetMap ở checkout. Route diagnostic cũ và slot D1 riêng cho provider cũ đã xóa; rate limit quote/checkout hiện có được giữ nguyên. Không xóa bảng dữ liệu hay thay schema/migration.

## Cấu hình và deploy thủ công

Local thêm GEOAPIFY_API_KEY vào `.dev.vars`; file mẫu chỉ có giá trị rỗng. Không dùng NEXT_PUBLIC_*, không ghi key thật vào mã nguồn/wrangler.jsonc. Production:

```powershell
npx wrangler secret put GEOAPIFY_API_KEY
npm run deploy
```

Không cần migration mới. Chưa gọi API thật với key production; tests chỉ dùng mocks hoặc runtime Worker local với outbound giả lập.

Tài liệu API: https://apidocs.geoapify.com/docs/geocoding/forward-geocoding/

## Kiểm tra và files thay đổi

Typecheck, lint, 127 tests trong 8 files, build Next.js và build Cloudflare đều đạt. Có cảnh báo môi trường Windows của OpenNext và cấu hình CommonJS của Vitest; không có lỗi. Không deploy production.

Sửa: lib/geocoding.ts, lib/geocoder-fetch.ts, lib/env.ts, lib/shipping-server.ts, components/checkout/shipping-options.tsx, .dev.vars.example, README.md, SHIPPING-IMPLEMENTATION.md; tests/geocoding.test.ts, tests/geocoder-fetch.test.ts, tests/geocoder-worker.test.ts, tests/shipping-api.test.ts, tests/d1.test.ts.

Xóa: app/api/admin/geocoding-diagnostics/route.ts và tests/geocoding-diagnostics.test.ts. Không sửa wrangler.jsonc, tọa độ, biểu phí hoặc migrations.

Khi ADDRESS_NOT_FOUND, log Geocoding selection failed chỉ chứa resultCount, inspectedCount và số ứng viên bị loại theo invalid/country/hanoi/precision. Không log trường địa chỉ hay key. Chưa xác nhận nguyên nhân production nếu chưa có log này.

## Retry và fallback có giới hạn

`fetchGeocoderWithRetry` trong `lib/geocoder-fetch.ts` dùng chung budget tối đa 3 outbound attempts cho toàn bộ một lần geocode, kể cả fallback. Mỗi attempt có AbortController mới, timeout 8 giây, clearTimeout trong finally. Thành công dừng retry ngay. Retry network/AbortError/TimeoutError và HTTP 408/425/429/500/502/503/504. Không retry 400/401/403/404, config, validation, response parse hoặc ADDRESS_NOT_FOUND.

Backoff exponential: 600ms rồi 1200ms, mỗi lần cộng jitter ngẫu nhiên 0–250ms. HTTP 429 hỗ trợ Retry-After dạng giây hoặc HTTP-date, cap 5000ms; giá trị không hợp lệ/quá khứ dùng backoff bình thường. Log Geocoder retry chỉ provider/attempt/status/reason.

Fallback khác retry: sau response thành công nhưng không có usable result, thử địa chỉ rút gọn (số ngõ + tên đường + phường/thành phố, rồi tên đường + phường/thành phố). Không lặp cùng query chỉ vì ADDRESS_NOT_FOUND, không chế thêm query cho địa chỉ không nhận diện được ngõ/ngách. Dừng ngay khi chọn được ứng viên. Budget chung ngăn tối đa 3 query x 3 retry thành 9 request; nếu transport đã dùng hết budget thì không chạy thêm fallback.

Quote và createOrder DELIVERY dùng cùng helper; payment, D1 insert và inventory không bị retry. Frontend vẫn gửi một request, khóa nút bằng busy và ref đồng bộ, hiện spinner “Đang tính khoảng cách...”. Timeout frontend 40 giây bao gồm 3 x 8 giây và tối đa hai khoảng chờ 5 giây. Response cũ bị bỏ nếu địa chỉ thay đổi. Các tests retry/geocoding dùng fake timers, không gọi Internet.

Kiểm tra bản retry/fallback hiện tại: typecheck, lint, 189 tests / 10 files, build Next.js và build Cloudflare đều đạt. Không migration mới, không deploy production.

## Form địa chỉ ba trường

Checkout chỉ yêu cầu address, ward, city; nhãn Tỉnh / Thành phố, hiện giữ phạm vi Hà Nội. district được giữ optional trong deliveryAddressSchema, mặc định chuỗi rỗng trong customerSchema để tương thích orders.district NOT NULL. Không cần migration và không sửa schema/migration cũ. Khách không cần nhập quận/huyện; API quote và createOrder DELIVERY chấp nhận thiếu district.

buildFullAddress bỏ district kể cả khi client cũ gửi nó. Ranking không dùng input.district; field hành chính từ Geoapify vẫn là metadata. Query lần lượt địa chỉ đầy đủ + phường + thành phố, số ngõ/tên đường + phường + thành phố, tên đường + phường + thành phố, đều thêm Việt Nam. Trần 3 outbound requests và retry giữ nguyên. Quote key chỉ theo address/ward/city.

formatOrderAddress trong lib/address.ts dùng chung ở account, admin và xác nhận đơn. Giữ district của đơn cũ, bỏ thành phần trống/null/undefined, không có dấu phẩy thừa. Đơn mới thiếu district lưu chuỗi rỗng, không thay dữ liệu cũ. Shipping, SePay, auth và inventory không đổi.

Kiểm tra form ba trường: typecheck, lint, 197 tests / 11 files, build và build:cloudflare đều đạt. Không deploy.

Files lượt này: lib/validation.ts, lib/shipping-quote-state.ts, lib/geocoding.ts, lib/address.ts; components/checkout/checkout-form.tsx; app/orders/[orderCode]/success/page.tsx, app/admin/orders/[orderCode]/page.tsx, app/account/orders/[orderCode]/page.tsx; tests/address.test.ts, tests/geocoding.test.ts, tests/shipping-api.test.ts, tests/d1.test.ts; README.md, SHIPPING-IMPLEMENTATION.md.

