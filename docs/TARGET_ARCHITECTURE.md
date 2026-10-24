# Phase 0 — Kiến trúc đích (đề xuất, chờ duyệt)

## Nguyên tắc

1. Không viết lại toàn bộ backend trong một lần. Route mới gắn song song
   route cũ; frontend chuyển từng tính năng; route cũ gỡ sau cùng, có
   quyết định riêng.
2. Backend là nguồn chân lý: giá, tồn kho, mã giảm giá, quyền sở hữu đơn,
   quyền admin đều kiểm chứng ở backend, không chỉ ẩn nút ở frontend.
3. Một nơi duy nhất cho: enum trạng thái đơn (`shared/order-status.js`),
   phân trang (`shared/pagination.js`), envelope mới (`shared/api-envelope.js`).
4. Mobile-first: layout hiện tại đã dùng Tailwind, `min-width: 320px` ở
   storefront; Phase 5 kiểm chứng 360/390/desktop, không tuyên bố responsive
   chỉ từ CSS.

## Bố cục đích (giữ monorepo hiện tại, không đổi tên workspace)

```
Server/                      # CommonJS, giữ nguyên trong Phase 0
  server.js                  # entry: dotenv -> json -> cookie -> CORS -> initRoute -> listen sau khi Mongo connect
  configs/ConnectDB.js       # MONGO_URI || MONGO_URL, throw nếu thiếu
  middlewares/verifyToken.js # verifyAccessToken (Bearer + reload user + isBlocked) + isAdmin (403)
  middlewares/ErrorHandler.js# legacy envelope {success, mes, message} — giữ cho route cũ
  routes/index.js            # Phase 1+: mount thêm /api/auth, /api/products, /api/orders, /api/admin BÊN CẠNH route cũ
  routes/{user,product,category,brand,coupon,bill,payment,blog,blogCategory}.js  # cũ, giữ nguyên Phase 0
  models/{user,product,bill,category,brand,coupon,couponRedemption}.js
  utils/{orderPolicy,orderPricing,inventory,validation,transactions}.js
apps/storefront/  (Vite 5173, strictPort)   apps/admin/  (Vite 5174, strictPort)
packages/api-client/  packages/contracts/  packages/ui/
```

## Thay đổi thuộc Phase 0 — và chỉ những thay đổi này

Staging tại `phase0/staging/` (chưa áp vào repo, chưa push):

- `shared/order-status.js` + test: enum tiếng Anh + label tiếng Việt một nơi
  + map từ trạng thái cũ + state machine + quy tắc hủy giữ nguyên.
- `shared/pagination.js` + test: parse/clamp page/limit + meta totalPages.
- `shared/api-envelope.js` + test: envelope mới `{success, data, pagination?}`
  / `{success, error:{code, message}}` cho route mới; route cũ giữ envelope cũ.
- `ENDPOINT_MAP.md`: bảng map đầy đủ (file này nằm cạnh staging).
- `TARGET_ARCHITECTURE.md`: file này.
- KHÔNG có: route mới, model mới, migration DB, thay đổi CORS/port,
  thay đổi ErrorHandler, thay đổi api-client, thay đổi frontend.

## Khi áp staging vào repo (sau khi duyệt Phase 0, đầu Phase 1)

Vị trí đề xuất (chốt lại khi tạo nhánh, không tự ý trong Phase 0):

- `Server/utils/orderStatus.js` ← `shared/order-status.js`
- `Server/utils/pagination.js` ← `shared/pagination.js`
- `Server/utils/apiEnvelope.js` ← `shared/api-envelope.js`
- `Server/test/phase0.*.test.js` ← các file test staging
- `packages/contracts/src/index.ts`: thêm `OrderStatus` + `ORDER_STATUS_LABELS_VI`
  (khi frontend bắt đầu dùng enum mới; BillStatus cũ giữ lại cho tới khi
  caller cuối cùng chuyển, để không vỡ build giữa chừng).
- Docs: `docs/PHASE_0_REPORT.md` từ `PHASE_0_REPORT.md` ở phase0/.

## Index — đề xuất, CHƯA áp vào DB (không có mongod trong sandbox, không chạm DB user)

Đã có (xác minh từ model):

- User: email unique. Category/Brand: title unique + index.
- Bill: `{user, createdAt}`, `{status, createdAt}`,
  `{user, idempotencyKey}` unique sparse; `reservationExpiresAt` index;
  `paymentOrderId`, `paymentTransactionId` index sparse.

Thiếu, đề xuất ở Phase 1 (khi thêm lọc/sắp xếp server cho products):

- Product: `{category: 1, createdAt: -1}`, `{title: 1}` (hoặc text index nếu
  chốt tìm kiếm full-text; hiện tại chỉ regex theo title), `{slug: 1}` đã
  unique nên không cần thêm.
- Product variants: không index riêng được cho subdocument quantity; kiểm
  tra tồn kho hiện dùng `$elemMatch` trên `variants._id` + quantity — giữ
  nguyên cho tới khi có bằng chứng chậm ở Phase 2.
- KHÔNG thêm index cho `reserved` vì field này chưa tồn tại; semantics
  `stock/reserved/available` của đặc tả là thay đổi model ở Phase 2/4,
  cần kế hoạch migration riêng (quantity hiện tại = số có thể bán trực tiếp,
  vì reserve trừ thẳng quantity; chuyển sang reserved mà không migration
  sẽ làm sai tồn kho).

## Môi trường — kiểm tra tên biến, KHÔNG đọc giá trị

`Server/.env.example` trên main đã đầy đủ cho Phase 0: PORT=8081,
MONGO_URI (ưu tiên) / MONGO_URL, SECRET_KEY, CORS_ORIGINS (5173/5174),
URL (storefront, dùng cho link email), NODE_ENV, CLOUDINARY_* (tùy chọn),
MAIL_* (tùy chọn), ADMIN_* (chỉ script createAdmin), ENABLE_RESERVATION_CLEANUP
+ 3 biến đi kèm, MOMO_*/VNP_*/PAYMENT_RETURN_FRONTEND (chỉ khi tích hợp thật).
Frontend `.env.example` (storefront + admin): chỉ `VITE_API_BASE_URL`,
mặc định trong code là `http://127.0.0.1:8081/api` nếu biến trống.
Kết luận Phase 0: KHÔNG cần biến secret mới. Không tạo file `.env` thật,
không commit `.env`.

## Rủi ro chính (đã ghi, chưa xử lý trong Phase 0)

1. Trùng tên/đường dẫn khi mount song song: `/api/products` vs `/api/product`
   không xung đột, nhưng api-client và legacy phải được kiểm tra từng caller.
2. Đổi method (GET logout→POST, PUT reset→POST, PUT cancel→POST,
   PUT admin update→PATCH) vỡ caller nếu đổi route mà quên caller — vì vậy
   đổi route + caller trong cùng một phase/tính năng.
3. Trạng thái COMPLETED/PROCESSING không có tương đương cũ: đơn cũ không
   bao giờ ở hai trạng thái này; báo cáo/admin phải xử lý "không có dữ liệu
   cũ" thay vì map sai sang DELIVERED.
4. Product không có brand: lọc brand là tính năng mới, không phải migration.
5. Tồn kho reserved: đổi semantics mà không có migration sẽ sai số liệu.
6. PR #2 chưa merge: api-client trên main thiếu forgot/reset/cancel — Phase 1
   phải quyết định lấy 3 method đó từ PR #2 hay viết lại theo API mới
   (khuyến nghị: viết lại theo API mới, dùng PR #2 làm tài liệu tham khảo
   về hành vi, không cherry-pick mù).
7. Connector ghi GitHub từng lỗi ở lần merge PR #2: tạo nhánh/PR Phase 1
   phải xác minh lại bằng read sau mỗi lần ghi, không tin payload ghi.

## Tiêu chí nghiệm thu Phase 0

- [x] Cấu trúc repo, git status (main 4f2996c, PR #2 OPEN), entry/script/
  port/CORS/route/Mongo/test/phụ thuộc đã xác định từ source thật.
- [x] Bảng map endpoint cũ→mới + caller + tác động đã lập, không route nào bị đổi/xóa.
- [x] Schema product/variant/bill/inventory đã kiểm tra, không xóa/reset dữ liệu.
- [x] Chỉ kiểm tra tên biến .env, không đọc/in giá trị bí mật.
- [x] Kiến trúc đích + file sẽ sửa + rủi ro + tiêu chí đã viết.
- [x] Thay đổi Phase 0 chỉ là staging helpers + test, có kết quả test thật.
- [ ] Người dùng duyệt báo cáo này trước khi sang Phase 1 (checkpoint bắt buộc).
