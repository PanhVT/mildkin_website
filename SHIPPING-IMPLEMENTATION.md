# Shipping với Geoapify

Backend `lib/geocoding.ts` gọi https://api.geoapify.com/v1/geocode/search bằng URLSearchParams: text=buildFullAddress(), format=json, filter=countrycode:vn, lang=vi, limit=5, apiKey từ env.GEOAPIFY_API_KEY. bias lấy shippingConfig(env), thứ tự longitude,latitude. Điểm gốc hiện tại vẫn STORE_LAT=21.000127 / STORE_LNG=105.843153.

`lib/geocoder-fetch.ts` dùng global fetch server-side, Accept application/json, AbortController 8 giây và clearTimeout trong finally. redirect=manual, không tự chuyển tiếp query chứa key/địa chỉ. Không axios/Node networking/GPS. Browser chỉ gọi API nội bộ.

Parse runtime bằng Zod. Bỏ ứng viên có tọa độ sai, quốc gia khác Việt Nam, không có bằng chứng thuộc Hà Nội . Không yêu cầu đủ mọi field hành chính. Chấp nhận building/amenity/street/suburb; không lấy centroid city/country. Trong tối đa 5 ứng viên hợp lệ, ưu tiên country_code vn, quận khớp district/county/suburb, city confidence rồi khoảng cách tới cửa hàng. Confidence chỉ dùng xếp hạng, không tự loại địa chỉ ngõ/ngách. Field tùy chọn có thể null. Khi thiếu city/state, có thể xác nhận Hà Nội từ formatted dù county chứa tên quận. Phường/đường là vị trí ước lượng nếu không có building.

Không cache geocode: mỗi lần quote hoặc tạo đơn DELIVERY đều geocode lại trên server, tính Haversine/phí/total từ nguồn tin cậy. Không tin fee/distance/lat/lng client. PICKUP phí 0, không gọi geocoder, không cần địa chỉ.

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
