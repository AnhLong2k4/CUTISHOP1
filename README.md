# CUTISHOP1 — CutiShop (bản xây mới)

Dự án thương mại điện tử thời trang CutiShop được xây dựng lại từ đầu
theo tài liệu “ĐẶC TẢ YÊU CẦU PHẦN MỀM — CUTISHOP v1.0”.

Repo cũ (chỉ để tham khảo và đối chiếu, không phát triển tiếp):
https://github.com/AnhLong2k4/CUTISHOP

## Công nghệ

- Frontend: React 19 + TypeScript + Vite 6 + Tailwind CSS 4, mobile-first từ 360px
- Backend: Node.js + Express 4 + TypeScript, MongoDB + Mongoose 8
- Kiểm thử: Vitest + Supertest, test tích hợp chạy trên MongoDB thật
  (in-memory, tách biệt hoàn toàn với database thật)

## Kiến trúc đã chốt

- Backend chạy cổng 8081, storefront 5173, admin 5174
- API có phiên bản: `/api/v1` — auth, products, orders (Phase 2+), admin
- Trạng thái đơn hàng: enum tiếng Anh ở backend, nhãn tiếng Việt tập
  trung tại một nơi duy nhất ở frontend (từ Phase 3)
- Phân quyền admin được kiểm tra ở backend
- Cấu trúc thư mục (npm workspaces monorepo):

  - `Server/` — backend Express + Mongoose (TypeScript)
  - `apps/storefront/` — giao diện khách hàng
  - `apps/admin/` — giao diện quản trị (Phase 1: phần tối thiểu cho catalog)
  - `packages/api-client/` — thư viện gọi API dùng chung
  - `packages/contracts/` — kiểu dữ liệu dùng chung
  - `docs/` — kế hoạch, kiến trúc, tài liệu API và báo cáo từng phase

Tài liệu chi tiết: `docs/API.md` (endpoint, schema, mã lỗi),
`docs/ARCHITECTURE_DECISIONS.md` (các quyết định kỹ thuật và lý do),
`docs/PLAN.md` (lộ trình), `docs/PHASE_1_REPORT.md` (báo cáo Phase 1).

## Cài đặt và chạy trên Windows

Yêu cầu: Node.js 20+ (khuyến nghị 24), MongoDB đang chạy ở máy bạn
(dịch vụ Windows “MongoDB” hoặc MongoDB Atlas).

1. Lấy code và cài dependency (tại thư mục gốc của repo):

   ```
   npm ci
   ```

2. Tạo file cấu hình cho backend: sao chép `Server/.env.example`
   thành `Server/.env` rồi điền giá trị thật trên máy của bạn
   (tuyệt đối không commit file `.env`). Các biến bắt buộc:
   `MONGO_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (hai
   khóa khác nhau, dài và ngẫu nhiên). Backend sẽ từ chối khởi
   động và liệt kê tên biến còn thiếu nếu cấu hình không hợp lệ.

   Ví dụ `MONGO_URI` với MongoDB local:
   `mongodb://127.0.0.1:27017/cutishop1`
   Với Atlas: dùng chuỗi `mongodb+srv://...` mà Atlas cấp, chỉ
   cần thay vào cùng biến này — không phải sửa code.

3. Tạo tài khoản admin đầu tiên (chạy một lần, trong thư mục gốc):

   ```
   # PowerShell:
   $env:ADMIN_EMAIL="admin@cuaban.local"; $env:ADMIN_PASSWORD="mat-khau-du-8-ky-tu"; $env:ADMIN_NAME="Quan Tri"
   npm run create-admin
   ```

   Script chỉ tạo khi tài khoản chưa tồn tại, không in mật khẩu ra log.

4. Chạy ba cửa sổ terminal riêng:

   ```
   npm run dev:server      # backend tại http://127.0.0.1:8081
   npm run dev:storefront  # http://127.0.0.1:5173
   npm run dev:admin       # http://127.0.0.1:5174
   ```

   Kiểm tra backend sống: mở `http://127.0.0.1:8081/api/v1/health`.

5. (Tùy chọn) Nạp dữ liệu mẫu cho môi trường phát triển — an toàn,
   chạy lặp không ghi đè dữ liệu đã có:

   ```
   npm run seed:dev -- --dry-run   # xem trước kế hoạch
   npm run seed:dev                 # nạp thật vào database trong MONGO_URI
   ```

## Cấu hình email (SMTP) và ảnh (Cloudinary)

- Quên mật khẩu cần gửi email. Điền `MAIL_HOST`, `MAIL_PORT`,
  `MAIL_USER`, `MAIL_PASSWORD` (mật khẩu ứng dụng của hộp thư),
  `MAIL_FROM` trong `Server/.env`. Khi chưa cấu hình SMTP và chạy
  ngoài production, hệ thống dùng chế độ dev: liên kết đặt lại mật
  khẩu được in vào log của backend để bạn tự kiểm thử. Production
  thiếu SMTP sẽ trả lỗi 503 `EMAIL_NOT_CONFIGURED` cho luồng này.
- Upload ảnh sản phẩm cần `CLOUDINARY_NAME`, `CLOUDINARY_KEY`,
  `CLOUDINARY_SECRET`. Chưa cấu hình thì endpoint upload trả 503
  `MEDIA_NOT_CONFIGURED`; vẫn có thể dùng URL ảnh trực tiếp trong
  form sản phẩm.

## Kiểm thử, typecheck, build

```
npm run lint        # ESLint toàn repo
npm run typecheck   # TypeScript cho server + 2 app
npm test            # Server (unit + integration) và test giao diện
npm run build       # build contracts, server (tsc) và 2 app (Vite)
```

Test tích hợp của server tự tải MongoDB in-memory ở lần chạy đầu
(cần mạng, khoảng 180MB) và luôn chạy trên database test riêng —
không bao giờ chạm vào database trong `MONGO_URI` của bạn.

## Khắc phục lỗi thường gặp

- Backend báo `Invalid environment configuration`: thiếu biến bắt
  buộc trong `Server/.env` — thông báo có liệt kê tên biến.
- Backend không khởi động được vì MongoDB: kiểm tra dịch vụ
  MongoDB đã chạy, hoặc chuỗi `MONGO_URI` đúng chưa. Backend chỉ
  listen sau khi kết nối database thành công.
- Frontend báo không tải được dữ liệu: kiểm tra backend đang chạy
  ở 8081 và `CORS_ORIGINS` trong `.env` có chứa origin của app
  (5173/5174). Đổi `.env` xong phải khởi động lại backend.
- Cổng bị chiếm (EADDRINUSE / strictPort): tắt tiến trình đang
  dùng cổng 8081/5173/5174 rồi chạy lại.

## Lộ trình

- Phase 1 (đã hoàn thành — đã merge vào `main`): nền tảng, authentication, catalog sản phẩm,
  storefront M01–M03 + M09, admin tối thiểu cho catalog
- Phase 2: giỏ hàng, báo giá phía server, checkout COD chống trùng
  đơn, tồn kho theo giao dịch
- Phase 3: đơn hàng, lịch sử, huỷ đơn, đánh giá, tài khoản
- Phase 4: admin đầy đủ — dashboard số liệu thật, đơn hàng, kho,
  coupon, nhật ký quản trị, cảnh báo tồn kho thấp
- Phase 5: kiểm thử mở rộng, responsive, tài liệu vận hành demo

Thanh toán online (MoMo/VNPay), gợi ý AI và các tính năng nâng cao
chỉ triển khai khi có sandbox/credentials thật và được duyệt riêng.
