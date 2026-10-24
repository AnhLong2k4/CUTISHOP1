# BÁO CÁO PHASE 1 — CUTISHOP1: Foundation, Authentication & Product Catalog

- Repository: https://github.com/AnhLong2k4/CUTISHOP1
- Branch: `feat/phase1-foundation-auth-catalog` (từ `main @ 97b3ed0`)
- Ngày: 2026-10-24
- Trạng thái kết thúc: Pull Request chờ review. KHÔNG merge, KHÔNG
  deploy, KHÔNG chạm dữ liệu production.

## 1. Phạm vi đã thực hiện

Đúng phạm vi Phase 1 đã được duyệt: nền tảng monorepo, authentication
đầy đủ vòng đời phiên, catalog sản phẩm (danh mục/thương hiệu/sản
phẩm/biến thể) với API công khai và API quản trị có RBAC, storefront
M01–M03 + M09 và khu admin tối thiểu cho catalog. Không triển khai
giỏ hàng, checkout, đơn hàng, thanh toán, AI hay microservices.

Mã nguồn được viết mới cho CUTISHOP1 theo kiến trúc của repo này;
không sao chép code, route hay model từ repository CUTISHOP cũ —
chỉ áp dụng các nguyên tắc thiết kế đã được kiểm chứng (phân trang
phía server, envelope phản hồi thống nhất, quy tắc giá biến thể,
mẫu seed an toàn) và sửa các bài học đã biết (lỗi xác thực thường
không còn trả 500).

## 2. Kiến trúc thực tế

```
CUTISHOP1 (npm workspaces)
├─ Server/                  Backend TypeScript: Express 4 + Mongoose 8
│  └─ src/
│     ├─ config/            env (zod, fail-fast), db
│     ├─ models/            User, RefreshSession, Category, Brand, Product
│     ├─ utils/             errors, pagination, pricing, catalogQuery,
│     │                     slug, tokens, password
│     ├─ services/          authService, catalogService, mailer (adapter)
│     ├─ controllers/       auth, catalog, adminCatalog (mỏng, qua service)
│     ├─ middleware/        errorHandler, validate (zod), auth/RBAC,
│     │                     rateLimit, upload, requestLogger
│     ├─ routes/            schemas + auth/catalog/admin/health routes
│     └─ scripts/           create-admin, seed-dev
├─ apps/storefront/         React 19 + Vite 6 + Tailwind 4 (5173)
├─ apps/admin/              React 19 + Vite 6 + Tailwind 4 (5174)
├─ packages/contracts/      Kiểu dùng chung + formatVND
├─ packages/api-client/     HTTP client tập trung, tự refresh khi 401
└─ docs/                    PLAN, TARGET_ARCHITECTURE, ENDPOINT_MAP,
                            API, ARCHITECTURE_DECISIONS, PHASE_1_REPORT
```

Các quyết định kỹ thuật quan trọng và lý do nằm trong
`docs/ARCHITECTURE_DECISIONS.md` (ADR-1 đến ADR-11): TypeScript cho
backend, API versioned `/api/v1`, tiền là số nguyên VND, quy tắc giá
biến thể, refresh token xoay vòng có phát hiện dùng lại, adapter
email, xóa mềm sản phẩm, tồn kho Phase 1 = `variants[].quantity`,
test tích hợp bằng MongoDB thật in-memory.

## 3. Endpoint và màn hình đã triển khai

Endpoint: xem bảng đầy đủ trong `docs/API.md`. Tóm tắt: `/health`;
auth register/login/refresh/logout/me/forgot-password/reset-password;
catalog công khai products (phân trang/tìm kiếm/lọc/sắp xếp phía
server), products/:id, categories, brands; admin CRUD cho products
(kèm upload ảnh), categories, brands — tất cả qua requireAuth +
requireAdmin ở backend.

Màn hình storefront: M01 trang chủ (danh mục, thương hiệu, mới nhất,
đang giảm giá), M02 danh sách với bộ lọc đồng bộ lên URL, M03 chi
tiết + chọn biến thể (giá hiệu lực, SKU, tồn kho từng biến thể),
M09 quên/đặt lại mật khẩu, đăng nhập, đăng ký, 404. Mọi trang có
trạng thái loading/error/empty và nút thử lại ở trạng thái lỗi.

Màn hình admin (tối thiểu): đăng nhập có kiểm tra role, danh sách
sản phẩm (gồm sản phẩm đã ngừng bán), form tạo/sửa sản phẩm với
trình sửa biến thể và tải ảnh, quản lý danh mục/thương hiệu.

## 4. Kiểm chứng — lệnh đã chạy và kết quả thực tế

Môi trường: sandbox Linux của Muse, Node v24.22.1, MongoDB
8.0.4 (replica set riêng cho runtime) và MongoMemoryServer
(MongoDB 7.0.24 in-memory cho test tích hợp).

| Hạng mục | Lệnh | Kết quả |
|---|---|---|
| Lint | `npm run lint` | PASS — 0 lỗi (1 lỗi cấu hình rule ở vòng đầu đã sửa) |
| Typecheck | `npm run typecheck` | PASS — server + storefront + admin, 0 lỗi |
| Unit test backend | `vitest run test/unit.test.ts` | PASS 14/14 (pricing, pagination, catalogQuery, slug) |
| Integration test backend | `vitest run` (toàn bộ Server) | PASS 44/44 tổng (gồm 30 test tích hợp: auth lifecycle, reset token, RBAC, catalog CRUD, phân trang/lọc/sort, ràng buộc model) |
| Test storefront | `npm --workspace @cutishop1/storefront run test` | PASS 2/2 (ProductCard: giá hiệu lực + badge hết hàng) |
| Test admin | `npm --workspace @cutishop1/admin run test` | PASS 1/1 (form đăng nhập quản trị) |
| Build | `npm run build` | PASS — contracts, server (tsc), storefront và admin (Vite) |
| Khởi động thiếu cấu hình | chạy server không có JWT secrets | PASS — từ chối khởi động, liệt kê tên biến thiếu, không in giá trị |
| Runtime API thật | script 34 kiểm tra HTTP tới backend + MongoDB thật | PASS 34/34 (xem mục 5) |
| Seed | dry-run + insert + chạy lại trên DB test riêng | PASS — tạo 11, chạy lại tạo 0/bỏ qua 11, 0 user |
| create-admin | chạy 2 lần | PASS — lần 2 báo đã tồn tại, không thay đổi |
| bcrypt cost 12 | đo thời gian băm | ~538 ms/hash trên sandbox — chấp nhận được cho đăng nhập/đăng ký |
| E2E trình duyệt + responsive 360/390/desktop | trình duyệt tự động mở localhost | **BLOCKED** — trình duyệt tự động không điều hướng được localhost (lượt này tác vụ trình duyệt lỗi hoàn toàn; vòng trước bị từ chối `invalid_request`). Chỉ có bằng chứng HTTP 200 cho 5173/5174/8081, không phải bằng chứng giao diện |
| Gửi email thật qua SMTP | — | **NOT RUN** — chưa có cấu hình SMTP. Luồng quên/đặt lại mật khẩu đã kiểm chứng end-to-end qua ConsoleMailer ở chế độ dev (liên kết trong log máy chủ → đặt lại → đăng nhập bằng mật khẩu mới → dùng lại token bị 400). Chưa có email thật nào được gửi/nhận |
| Upload ảnh qua Cloudinary | API test với file thật | **NOT RUN** phần tích hợp — endpoint trả đúng 503 `MEDIA_NOT_CONFIGURED` khi chưa cấu hình (đã kiểm chứng). Chưa kiểm chứng upload thành công vì không có credentials |
| GitHub Actions CI | file workflow | **BLOCKED khi đẩy lên GitHub** — kết nối GitHub của Muse không có quyền ghi vào `.github/workflows/` (API trả 403). Nội dung workflow đã được commit tại `docs/ci-workflow.yml`; bạn chỉ cần tạo file `.github/workflows/ci.yml` trên giao diện web GitHub với đúng nội dung đó (một lần, khoảng một phút) thì CI sẽ chạy trên mọi PR. Các bước kiểm tra tương đương đã chạy đầy đủ ở local/sandbox (lint, typecheck, test, build — xem các dòng trên) |

Ba lỗi thật đã phát hiện và sửa trong quá trình (đều có test bắt
lại): validator số nguyên VND chạy trên giá trị null khiến tạo sản
phẩm thất bại; race khi index unique chưa kịp dựng trong test
ràng buộc (đã sửa bằng cách chờ `Model.init()`); helper số nguyên
VND trong schema Mongoose cần khai báo kiểu tường minh cho
TypeScript strict.

## 5. Chi tiết runtime API (34/34 PASS)

Chạy backend thật (tsx, cổng 8081) nối MongoDB replica set test
(database `cutishop1_runtime_test`, dữ liệu tổng hợp): health 200;
đăng ký 201 + cookie refresh HttpOnly; trùng email 409; mật khẩu
ngắn 400; sai mật khẩu 401 (không phải 500); /me 401 khi thiếu
token và 200 khi có; refresh xoay vòng cookie qua HTTP thật, dùng
lại cookie cũ → 401 SESSION_REVOKED; admin tạo danh mục/thương
hiệu/sản phẩm giữ nguyên SKU và giá biến thể; khách thường 403 và
khách lạ 401 trên API admin; giá chi tiết: biến thể ghi đè 180.000
thắng, biến thể kế thừa dùng giá sale 150.000; phân trang 13 sản
phẩm (trang 1: 12, trang 2: 1); tìm kiếm, lọc brand/inStock, sort
priceAsc đúng; sort/id sai → 400; sản phẩm không có → 404;
productCount = 13 đúng; upload thiếu cấu hình → 503; toàn bộ
luồng quên mật khẩu qua dev mailer PASS như mô tả ở mục 4.

## 6. Dependency chính (phiên bản thực tế trong lockfile)

express 4.22.3 · mongoose 8.24.7 · jsonwebtoken 9.0.3 · zod 3.25.76 ·
bcryptjs 3.0.3 · helmet 8.3.0 · express-rate-limit 7.5.1 ·
multer 2.5.0 (đã nâng từ 1.x vì bản 1.x có lỗ hổng đã được vá ở 2.x) ·
nodemailer 6.10.1 · cloudinary 2.11.0 · react 19.3.1 ·
react-router-dom 7.18.4 · vite 6.4.5 · tailwindcss 4.3.3 ·
typescript 5.9.3 · vitest 3.2.7 · mongodb-memory-server 10.4.3 ·
eslint 9.39.5. Lockfile (lockfileVersion 3) được commit — cài bằng
`npm ci` để tái lập đúng phiên bản.

Biến môi trường: xem `Server/.env.example` (chỉ tên biến và giá trị
mẫu). Bắt buộc: MONGO_URI, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET.
Không có bí mật nào được commit trong PR này (đã rà soát: chỉ
.env.example chứa placeholder; chuỗi bí mật trong test/runtime đều
là giá trị tổng hợp dùng một lần trong sandbox).

## 7. Cách chạy local trên Windows

Tóm tắt (chi tiết trong README): `npm ci` ở gốc → sao chép
`Server/.env.example` thành `Server/.env` và điền giá trị trên máy
bạn → `npm run create-admin` với ADMIN_EMAIL/ADMIN_PASSWORD đặt
qua biến môi trường → ba terminal `npm run dev:server`,
`npm run dev:storefront`, `npm run dev:admin` → kiểm tra
`http://127.0.0.1:8081/api/v1/health`.

MongoDB: dùng MongoDB local (dịch vụ Windows) với MONGO_URI dạng
`mongodb://127.0.0.1:27017/cutishop1`, hoặc Atlas bằng cách thay
chuỗi `mongodb+srv://...` — không đổi code. SMTP: điền nhóm biến
MAIL_* khi muốn nhận email đặt lại mật khẩu thật; chưa có SMTP thì
dùng chế độ dev (liên kết in ở log backend) như đã kiểm chứng.

## 8. Hướng dẫn review Pull Request

1. Đọc báo cáo này và `docs/ARCHITECTURE_DECISIONS.md` trước.
2. Nếu bạn đã đặt file CI theo ghi chú ở mục 4, đối chiếu kết quả CI trên PR (lint/typecheck/test/build); chưa đặt cũng không sao vì các bước tương đương đã có kết quả trong báo cáo này.
3. Chạy local theo mục 7; đăng ký một tài khoản test mới (tránh
   email trùng — trùng sẽ trả 409 đúng thiết kế), đăng nhập,
   đăng xuất, quên mật khẩu bằng chế độ dev hoặc SMTP của bạn.
4. Đăng nhập admin ở 5174, tạo một danh mục + sản phẩm có 2 biến
   thể (một biến thể có giá riêng), kiểm tra storefront 5173:
   trang chủ, lọc ở /products, chi tiết hiển thị đúng giá/SKU.
5. Thử đăng nhập admin bằng tài khoản thường: phải bị từ chối.
6. Kiểm tra giao diện ở bề rộng 360px, 390px và desktop bằng
   DevTools (mục BLOCKED ở môi trường của Muse — cần bạn xác
   minh trên máy thật).

## 9. Rủi ro và giới hạn còn lại

- P1 (chờ xác minh phía người dùng): giao diện thật và responsive
  chưa được kiểm chứng bằng trình duyệt (BLOCKED ở môi trường
  Muse). API và build đã đạt, nhưng chưa nên coi là bằng chứng UI.
- P2: gửi email thật (SMTP) và upload Cloudinary chưa kiểm chứng
  end-to-end vì thiếu credentials — code đi qua adapter và đã
  kiểm chứng nhánh "chưa cấu hình" (503) cùng luồng token đầy đủ.
- P2: sắp xếp theo tên dùng collation nhị phân của MongoDB
  (ADR-10); sắp xếp theo giá dùng giá gốc của sản phẩm, khoảng
  giá hiệu lực vẫn hiển thị đúng trong từng thẻ sản phẩm.
- P3: admin còn tối giản (đổi tên danh mục/thương hiệu qua hộp
  thoại nhập nhanh; chưa có phân trang phía admin ngoài giới hạn
  100 mục) — thuộc phạm vi hoàn thiện của Phase 4.
- Không có lỗi P0/P1 nào đang mở trong phạm vi đã kiểm chứng.

## 10. Roadmap tiếp theo

Phase 2 — Giỏ hàng & checkout COD. Thứ tự: (1) giỏ hàng phía
client + báo giá phía server (server tính lại toàn bộ tiền);
(2) model đơn hàng + trạng thái enum tiếng Anh, nhãn Việt tập
trung một nơi; (3) tạo đơn có idempotency key chống trùng;
(4) trừ/tồn kho trong transaction và hoàn kho khi hủy;
(5) màn hình giỏ/checkout/đơn của tôi. Tiêu chí nghiệm thu: đặt
đơn hai lần với cùng idempotency key chỉ tạo một đơn; giá ở đơn
luôn do server tính; tồn kho không âm trong mọi trường hợp test;
toàn bộ test Phase 1 vẫn PASS.

Phase 3 — Lịch sử đơn, hủy đơn, đánh giá, tài khoản.
Phase 4 — Admin đầy đủ: dashboard số liệu từ DB, quản lý đơn/kho/
coupon/người dùng, nhật ký quản trị, cảnh báo tồn kho thấp.
Phase 5 — Kiểm thử mở rộng, responsive, tài liệu vận hành demo.
Thanh toán online và AI chỉ khi có sandbox/credentials thật và
được duyệt riêng.

## 11. Xác nhận hành động chưa thực hiện

Chưa merge PR; chưa deploy production; chưa sửa/xóa bất kỳ dữ
liệu nào ngoài các database test tự tạo trong sandbox
(`cutishop1_runtime_test`, `cutishop1_seed_test` và MongoDB
in-memory của test); repository CUTISHOP cũ không bị thay đổi
trong Phase 1 này.
