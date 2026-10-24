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
`inStock`, và từng biến thể có `effectivePrice`, `inStock`.
Quy tắc giá: giá riêng của biến thể thắng; nếu không có, dùng giá
khuyến mãi khi đang trong thời gian khuyến mãi hợp lệ; khuyến mãi
không cộng dồn lên giá riêng của biến thể.

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
