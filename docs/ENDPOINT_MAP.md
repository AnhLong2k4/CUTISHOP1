# Phase 0 — Bảng ánh xạ endpoint cũ → endpoint mới

Baseline: GitHub `main @ 4f2996c` (PR #1 đã merge; PR #2 vẫn OPEN, chưa có trên main).
Quy tắc Phase 0: KHÔNG route nào dưới đây bị đổi, xóa hay thay method trong Phase 0.
Route mới được gắn song song với route cũ trong Phase 1+; route cũ chỉ gỡ khi
mọi caller đã chuyển và có quyết định gỡ riêng. Caller React duy nhất là
`packages/api-client` (storefront/admin đều qua `services/api.ts` → `createApiClient`).
Legacy AngularJS (`User/src`, `Admin/src`) dùng base `http://127.0.0.1:8081/api/`
và được giữ để rollback — không phá chúng trong Phase 0.

Lưu ý về main: api-client trên main CHƯA có forgot/reset/cancel/upload
(những method đó nằm ở PR #2 / Phase 2 staging, chưa merge). Bảng dưới map
theo backend route (đã có trên main), không theo api-client trên main.

## Auth — cũ `/api/user` → mới `/api/auth`

| Cũ | Mới | Auth | Caller / ghi chú | Chuyển ở |
|---|---|---|---|---|
| POST `/api/user/register` | POST `/api/auth/register` | public | RegisterPage qua api-client; backend ép role=user | Phase 1 |
| POST `/api/user/login` | POST `/api/auth/login` | public | LoginPage; access token 5 phút + refresh rotation (audit cũ) | Phase 1 |
| POST `/api/user/refreshToken` | POST `/api/auth/refresh` | cookie | api-client tự refresh khi 401; đổi tên path, giữ semantics | Phase 1 |
| GET `/api/user/logout` | POST `/api/auth/logout` | auth | ĐỔI METHOD GET→POST: phải đổi caller cùng lúc, không đổi route cũ trước | Phase 1 |
| GET `/api/user/getCurrent` | GET `/api/auth/me` | auth | SessionContext storefront + admin | Phase 1 |
| POST `/api/user/forgot-password` | POST `/api/auth/forgot-password` | public | Backend đã có; cần `URL` trong Server/.env để tạo link (đã ghi trong PR #2) | Phase 1 |
| PUT `/api/user/reset-password` | POST `/api/auth/reset-password` | public | ĐỔI METHOD PUT→POST; token gửi raw, backend sha256 + 15 phút + 1 lần | Phase 1 |
| PUT `/api/user/current` | PATCH `/api/auth/me` (đề xuất) | auth | Đổi thông tin cá nhân; đặc tả không liệt kê riêng, chốt ở Phase 3 | Phase 3 |
| GET `/api/user` (admin) | GET `/api/admin/users` | admin | AdminUsersPage | Phase 4 |
| GET `/api/user/admin/get/:uid` | GET `/api/admin/users/:id` | admin | AdminUserDetailPage | Phase 4 |
| PUT `/api/user/admin/update/:uid` | PATCH `/api/admin/users/:id` + PATCH `/api/admin/users/:id/status` | admin | Đặc tả chỉ liệt kê status; update đầy đủ (name/email/mobile/address/isBlocked) cần endpoint riêng — chốt ở Phase 4, không thu hẹp quyền admin trong Phase 0 | Phase 4 |
| POST `/api/user/admin/create` | POST `/api/admin/users` | admin | Tạo user từ admin | Phase 4 |
| DELETE `/api/user` (admin) | KHÔNG có trong đặc tả | admin | KHÔNG migrate trong lõi; giữ legacy, quyết định gỡ riêng | — |
| PUT `/api/user/admin/upload/:uid` (avatar) | KHÔNG có trong đặc tả | admin | Giữ legacy, quyết định ở Phase 4 | — |
| GET/POST/DELETE `/api/user/wishlist` (+ PUT alias) | KHÔNG có trong đặc tả | auth | Ngoài lõi; giữ legacy, không xóa | — |

## Sản phẩm / danh mục / thương hiệu — cũ `/api/product|category|brand` → mới `/api/products|categories|brands` + `/api/admin`

| Cũ | Mới | Auth | Caller / ghi chú | Chuyển ở |
|---|---|---|---|---|
| GET `/api/product` | GET `/api/products` | public | Storefront/admin list; HIỆN TẠI TRẢ TOÀN BỘ, không phân trang (bản phân trang bị comment trong controller). Phase 1 phải thêm phân trang server + lọc/sắp xếp, dùng `shared/pagination.js` staging | Phase 1 |
| GET `/api/product/:pid` | GET `/api/products/:id` | public | ProductDetailPage; envelope hiện tại `{success, products}` / chi tiết theo controller | Phase 1 |
| POST `/api/product` | POST `/api/admin/products` | admin | AdminProductFormPage (tạo); update hiện thay variants wholesale — giữ hành vi này cho tới Phase 2 | Phase 1/2 |
| PUT `/api/product/:pid` | PATCH `/api/admin/products/:id` | admin | ĐỔI METHOD PUT→PATCH, đổi caller cùng lúc | Phase 1/2 |
| DELETE `/api/product/:pid` | DELETE `/api/admin/products/:id` | admin | Chặn xóa khi đã có đơn chứa sản phẩm (controller hiện tại) | Phase 1/2 |
| PUT `/api/product/upload/:pid` | POST `/api/admin/products/:id/images` (đề xuất) | admin | Multer `images` tối đa 10, Cloudinary `Ecommerce`, append-only, không có xóa ảnh; đổi ở Phase 2 cùng form | Phase 2 |
| PUT `/api/product/ratings` | POST `/api/products/:id/reviews` | auth | Rating hiện nhúng trong `product.rating`; đặc tả yêu cầu collection Reviews riêng — migration ở Phase 3, không đổi model trong Phase 0 | Phase 3 |
| GET `/api/category`, GET `/api/category/:cid` | GET `/api/categories`, GET `/api/categories/:id` | public | Lọc sản phẩm theo danh mục | Phase 1 |
| POST/PUT/DELETE `/api/category` | POST/PATCH/DELETE `/api/admin/categories` (đề xuất) | admin | Đặc tả yêu cầu quản lý danh mục ở admin nhưng không liệt kê endpoint riêng | Phase 1 |
| GET `/api/brand`, GET `/api/brand/:cid` | GET `/api/brands`, GET `/api/brands/:id` | public | Lưu ý: Product model hiện KHÔNG có trường brand — lọc theo brand là tính năng mới, cần thêm field ở Phase 1, không tự suy ra từ model cũ | Phase 1 |
| POST/PUT/DELETE `/api/brand` | POST/PATCH/DELETE `/api/admin/brands` (đề xuất) | admin | Như danh mục | Phase 1 |

## Đơn hàng — cũ `/api/bill` → mới `/api/orders` + `/api/checkout` + `/api/admin/orders`

| Cũ | Mới | Auth | Caller / ghi chú | Chuyển ở |
|---|---|---|---|---|
| POST `/api/bill` | POST `/api/orders` | auth | CheckoutPage; backend tính giá server, quote fingerprint, idempotency (index unique sparse user+idempotencyKey), transaction | Phase 2 |
| POST `/api/bill/quote` | POST `/api/checkout/quote` | auth | Quote trước khi tạo đơn; KHÔNG phải `/api/orders/quote` | Phase 2 |
| GET `/api/bill/billUser/getall` | GET `/api/orders/my` | auth | OrdersPage; lưu ý tên cũ `billUser/getall` | Phase 3 |
| GET `/api/bill/:id` | GET `/api/orders/:id` | auth (owner/admin) | OrderDetailPage; vi phạm/không tồn tại trả 404 gộp | Phase 3 |
| PUT `/api/bill/:id/cancel` | POST `/api/orders/:id/cancel` | auth (owner/admin) | ĐỔI METHOD PUT→POST; hủy chỉ khi PENDING/CONFIRMED + paymentStatus != paid, giải phóng kho trong transaction | Phase 3 |
| PUT `/api/bill/:id` | PATCH `/api/orders/:id` (đề xuất) | auth | Chỉ sửa field khách được sửa khi PENDING (orderPolicy CUSTOMER_EDITABLE_FIELDS); chốt ở Phase 3 | Phase 3 |
| GET `/api/bill` | GET `/api/admin/orders` | admin | AdminOrdersPage; ĐÃ có phân trang page/limit (mặc định 20, tối đa 100), lọc status, tìm theo name/email/mobile/_id, sắp newest/oldest/totalAsc/totalDesc | Phase 4 |
| PUT `/api/bill/status/:id` | PATCH `/api/admin/orders/:id/status` | admin | ĐỔI METHOD + PATH; chuyển trạng thái theo state machine, không tùy ý | Phase 4 |

## Mới hoàn toàn (không có route cũ để map) — không được ghi là "migration"

| Mới | Ghi chú | Chuyển ở |
|---|---|---|
| GET/POST/PATCH/DELETE `/api/cart/items` | Giỏ cũ ở storefront là localStorage (`cutishop.cart.v1`), `user.cart` trong model không có api-client method. Đây là API mới, không phải đổi tên | Phase 2 |
| GET/POST/PATCH/DELETE `/api/addresses` | Cũ chỉ có `user.address` là 1 chuỗi. Collection Addresses riêng là mới, cần migration từ chuỗi cũ — quyết định ở Phase 2/3 | Phase 2/3 |
| GET `/api/products/:id/reviews`, POST `/api/products/:id/reviews` | Xem bảng ratings ở trên; model mới ở Phase 3 | Phase 3 |
| GET `/api/admin/dashboard`, GET `/api/admin/reports/sales` | Dashboard hiện tại (AdminHomePage) chưa có endpoint tổng hợp riêng trong route list; phải dùng dữ liệu thật, không số giả | Phase 4 |
| GET `/api/admin/inventory`, POST `/api/admin/inventory/adjustments`, GET `/api/admin/inventory/movements` | InventoryMovements là collection mới; kho cũ chỉ có `variants[].quantity` + flag `inventoryReserved/inventoryReleased` trên bill. KHÔNG đổi semantics kho trong Phase 0 | Phase 4 |
| GET/POST/PATCH `/api/admin/coupons` | Coupon cũ: route `/api/coupon` CRUD, GET public. Phase 4 phải quyết định: list coupon có nên chỉ dành cho admin không — không tự khóa public trong Phase 0 | Phase 4 |

## Giữ nguyên, ngoài lõi — không chạm trong Phase 0–5 lõi

- `/api/payment/momo/*`, `/api/payment/vnpay/*`: thanh toán thật nằm ngoài lõi (theo quyết định đã chốt). Giữ nguyên, không tuyên bố tích hợp mới.
- `/api/blog`, `/api/blog-category`: không có trong đặc tả lõi. Giữ nguyên.
- `/api/coupon` cũ: giữ nguyên cho tới Phase 4 (xem hàng coupon ở trên).
