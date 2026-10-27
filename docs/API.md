# CUTISHOP1 — Tài liệu API (v1)

Base URL mặc định khi chạy local: `http://127.0.0.1:8081/api/v1`

## Định dạng phản hồi

- Thành công: `{ "success": true, "data": ... }`
- Lỗi: `{ "success": false, "error": { "code": "...", "message": "...", "details": ... } }`
- Danh sách sản phẩm: `data = { items: [...], pagination: { page, limit, total, totalPages } }`
- Giá tiền luôn là số nguyên VND. Không phản hồi nào chứa password,
  password hash, reset token hay refresh token.

## Hệ thống

| Method | Endpoint | Quyền | Mô tả |
|---|---|---|---|
| GET | /health | Công khai | Trạng thái sống còn: `{ status, database }`. 200 khi DB kết nối, 503 khi mất kết nối. Không lộ biến môi trường. |

## Auth — /auth

| Method | Endpoint | Quyền | Request chính | Status đáng chú ý |
|---|---|---|---|---|
| POST | /auth/register | Công khai (rate limit) | `{ name, email, password>=8 }` | 201 kèm access token + cookie refresh; 409 `EMAIL_ALREADY_EXISTS`; 400 `VALIDATION_ERROR` |
| POST | /auth/login | Công khai (rate limit) | `{ email, password }` | 200; 401 `INVALID_CREDENTIALS` (thông điệp chung cho email lạ và sai mật khẩu) |
| POST | /auth/refresh | Cookie refresh + header `X-Requested-With` | — | 200 xoay vòng token; 401 `SESSION_REVOKED` khi phát hiện dùng lại token cũ (thu hồi mọi phiên); 403 `CSRF_CHECK_FAILED` khi thiếu header |
| POST | /auth/logout | Cookie refresh + header | — | 200, thu hồi phiên hiện tại |
| GET | /auth/me | Bearer access token | — | 200 thông tin tài khoản; 401 `TOKEN_MISSING`/`TOKEN_INVALID`/`TOKEN_EXPIRED` |
| POST | /auth/forgot-password | Công khai (rate limit) | `{ email }` | Luôn 200 với thông điệp chung, không tiết lộ email có tồn tại hay không |
| POST | /auth/reset-password | Công khai | `{ token, password>=8 }` | 200; 400 `RESET_TOKEN_INVALID` khi token sai/hết hạn/đã dùng. Đặt lại thành công thu hồi mọi phiên. |

Access token: JWT, hạn 15 phút (cấu hình `ACCESS_TOKEN_TTL_MINUTES`),
gửi qua header `Authorization: Bearer ...`, client chỉ giữ trong bộ nhớ.
Refresh token: JWT 7 ngày trong cookie HttpOnly `cutishop1_refresh`
(path `/api/v1/auth`, SameSite=Lax, Secure khi production), xoay vòng
mỗi lần refresh; server chỉ lưu bản băm sha256 của refresh token.

Reset token: chuỗi ngẫu nhiên 32 byte; server chỉ lưu bản băm sha256,
hạn 15 phút, dùng một lần. Email chứa liên kết
`{APP_URL}/password/reset/<token>`.

## Catalog công khai

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | /products | Danh sách sản phẩm đang bán. Query: `page`, `limit` (mặc định 20, tối đa 100), `search`, `category`, `brand`, `size`, `color`, `minPrice`, `maxPrice`, `inStock`, `sale`, `sort` ∈ {newest, oldest, priceAsc, priceDesc, nameAsc, nameDesc}. Tham số không hợp lệ → 400. |
| GET | /products/:id | Chi tiết + biến thể, giá hiệu lực đã tính sẵn. 400 khi id sai định dạng, 404 khi không có/đã ngừng bán. |
| GET | /categories | Danh mục đang hiện, kèm `productCount`. |
| GET | /brands | Thương hiệu đang hiện, kèm `productCount`. |

Mỗi sản phẩm trả kèm: `priceRange {min,max}`, `onSale`, `totalStock`,
`totalAvailable`, `inStock`, và từng biến thể có `effectivePrice`,
`quantity`, `reserved`, `available`, `inStock` (inStock tính theo
`available = quantity - reserved`, không phải theo quantity thô).
Quy tắc giá: giá riêng của biến thể thắng; nếu không có, dùng giá
khuyến mãi khi đang trong thời gian khuyến mãi hợp lệ; khuyến mãi
không cộng dồn lên giá riêng của biến thể.

## Giỏ hàng và báo giá — bắt buộc đăng nhập

Giỏ hàng lưu theo user, không giữ kho. Báo giá (quote) chỉ tính toán,
không giữ kho và không tiêu thụ coupon; kiểm tra quyết định chỉ xảy
ra lúc tạo đơn. Giá, giảm giá và phí vận chuyển do server tính; các
trường tiền do client gửi lên trong body tạo đơn bị loại bỏ.

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | /cart | Giỏ hàng của user hiện tại |
| POST | /cart/items | Thêm dòng `{ productId, sku, quantity }`; cùng SKU thì cộng dồn |
| PATCH | /cart/items | Đặt số lượng cho một dòng; `quantity = 0` thì xóa dòng |
| DELETE | /cart/items | Xóa một dòng `{ productId, sku }` |
| DELETE | /cart | Xóa toàn bộ giỏ hàng |
| POST | /checkout/quote | Báo giá `{ items, couponCode? }` → `{ items, couponCode, subtotal, discount, subtotalAfterDiscount, shipping, total, canOrder }`. Thứ tự tính: subtotal → discount → shipping → total, số nguyên VND. |

## Đơn hàng COD — bắt buộc đăng nhập, yêu cầu MongoDB replica set

Tạo đơn bắt buộc header `Idempotency-Key` (UUID v4) hoặc field
`idempotencyKey` trong body. Cùng user + cùng key + cùng payload thì
trả 200 kèm đơn cũ; cùng key nhưng payload khác thì 409
`IDEMPOTENCY_KEY_REUSED`. Tạo đơn chạy trong một MongoDB transaction
(giữ kho + ghi InventoryMovement + tiêu thụ coupon nếu có); trên
MongoDB standalone, tạo đơn fail rõ ràng 503
`TRANSACTION_NOT_SUPPORTED`, không có đường lùi ghi không transaction.
Giữ kho 48 giờ cho đơn PENDING (cấu hình `RESERVATION_HOLD_HOURS`);
hết hạn thì đơn bị hủy và giải phóng kho đúng một lần.

| Method | Endpoint | Mô tả |
|---|---|---|
| POST | /orders | Tạo đơn COD. Body: `{ items, shippingAddress { name, phone, address, note? }, couponCode? }` + Idempotency-Key. 201 đơn mới, 200 đơn cũ khi retry; 409 `INSUFFICIENT_STOCK`, `COUPON_*`, `IDEMPOTENCY_KEY_REUSED`; 400 `IDEMPOTENCY_KEY_REQUIRED` |
| GET | /orders/my | Lịch sử đơn của chính user, phân trang, lọc `status` |
| GET | /orders/:id | Chi tiết đơn của chính user. Đơn của user khác → 404 gộp, không tiết lộ |
| POST | /orders/:id/cancel | Khách hủy đơn của mình (PENDING/CONFIRMED; PROCESSING chỉ admin hủy qua route admin) |
| POST | /orders/:id/complete | Khách xác nhận hoàn thành đơn DELIVERED |
| POST | /orders/:id/return-request | Khách yêu cầu trả toàn đơn trong 7 ngày kể từ DELIVERED |
| GET | /admin/orders | Admin: danh sách đơn, lọc `status` |
| GET | /admin/orders/:id | Admin: chi tiết đơn bất kỳ |
| PATCH | /admin/orders/:id/status | Admin: chuyển trạng thái `{ status, reason?, restock? }`. `restock` chỉ có ý nghĩa khi chuyển sang RETURNED (nhập lại kho khi xác nhận còn bán được). Chuyển sai → 409 `ORDER_TRANSITION_INVALID` |

## Quản trị coupon — /admin/coupons

| Method | Endpoint | Mô tả |
|---|---|---|
| POST | /admin/coupons | Tạo mã `{ code, type: PERCENT\|FIXED, value, maxDiscount?, minOrderAmount?, startsAt?, endsAt?, isActive?, usageLimitTotal?, usageLimitPerUser? }`. PERCENT bắt buộc `maxDiscount` và `value` 1–100 |
| GET | /admin/coupons | Danh sách mã, phân trang |
| GET | /admin/coupons/:id | Chi tiết mã |
| PATCH | /admin/coupons/:id | Cập nhật mã (các trường tùy chọn) |
| DELETE | /admin/coupons/:id | Xóa mã chỉ khi chưa từng sử dụng; đã sử dụng → 409 `COUPON_IN_USE`, hãy vô hiệu hóa thay vì xóa |

Quy tắc coupon trong đơn: một đơn một mã, toàn đơn, không cộng dồn;
`minOrderAmount` xét trên subtotal trước giảm và trước phí; hoàn lượt
chỉ khi hủy từ PENDING/CONFIRMED, đúng một lần (`USED → VOIDED`).

## Quản trị — /admin (bắt buộc Bearer + role admin; 401 chưa đăng nhập, 403 không phải admin)

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | /admin/products | Danh sách toàn bộ sản phẩm (kể cả đã ngừng bán), cùng bộ tham số như /products |
| GET | /admin/products/:id | Chi tiết một sản phẩm bất kỳ trạng thái |
| POST | /admin/products | Tạo sản phẩm. Body theo schema: title, category, brand?, price (nguyên VND), salePrice?, cửa sổ sale?, images?, isActive?, variants[{ sku, color?, size?, price?, quantity }] — ít nhất 1 biến thể, SKU không trùng (409 `SKU_ALREADY_EXISTS`) |
| PATCH | /admin/products/:id | Cập nhật toàn bộ sản phẩm (biến thể thay thế trọn gói) |
| DELETE | /admin/products/:id | Xóa mềm: đặt `isActive=false`, dữ liệu vẫn giữ |
| PUT | /admin/products/:id/images | Upload ảnh (multipart, field `images`, tối đa 10 file, ≤5MB/file). 503 `MEDIA_NOT_CONFIGURED` khi chưa cấu hình Cloudinary |
| POST/PATCH/DELETE | /admin/categories[/:id] | CRUD danh mục. DELETE bị chặn 409 `CATEGORY_IN_USE` khi đang có sản phẩm tham chiếu |
| POST/PATCH/DELETE | /admin/brands[/:id] | CRUD thương hiệu. DELETE bị chặn 409 `BRAND_IN_USE` tương tự |

## Mã lỗi thường gặp

`VALIDATION_ERROR` 400 · `INVALID_CREDENTIALS` 401 · `TOKEN_*` 401 ·
`SESSION_*` 401 · `FORBIDDEN` 403 · `CSRF_CHECK_FAILED` 403 ·
`NOT_FOUND` 404 · `EMAIL_ALREADY_EXISTS` 409 · `SKU_ALREADY_EXISTS` 409 ·
`CATEGORY_IN_USE`/`BRAND_IN_USE` 409 · `DUPLICATE_KEY` 409 ·
`RATE_LIMITED` 429 · `EMAIL_NOT_CONFIGURED` 503 ·
`MEDIA_NOT_CONFIGURED` 503 · `INTERNAL_ERROR` 500 (không lộ chi tiết)
