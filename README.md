# CUTISHOP1 — CutiShop (bản xây mới)

Dự án thương mại điện tử thời trang CutiShop được xây dựng lại từ đầu
theo tài liệu “ĐẶC TẢ YÊU CẦU PHẦN MỀM — CUTISHOP v1.0”.

Repo cũ (chỉ để tham khảo và đối chiếu, không phát triển tiếp):
https://github.com/AnhLong2k4/CUTISHOP

## Công nghệ

- Frontend: React + TypeScript + Vite + Tailwind CSS, mobile-first từ 360px
- Backend: Node.js + Express
- Database: MongoDB + Mongoose
- Thanh toán cốt lõi: COD (MoMo/VNPay để giai đoạn sau)

## Kiến trúc đã chốt

- Backend chạy cổng 8081, storefront 5173, admin 5174
- API mới: /api/auth, /api/products, /api/orders, /api/admin
- Trạng thái đơn hàng: enum tiếng Anh ở backend, nhãn tiếng Việt tập
  trung tại một nơi duy nhất ở frontend
- Phân quyền admin được kiểm tra ở backend
- Cấu trúc thư mục:

  - `Server/` — backend Express + Mongoose
  - `apps/storefront/` — giao diện khách hàng
  - `apps/admin/` — giao diện quản trị
  - `packages/api-client/` — thư viện gọi API dùng chung
  - `packages/contracts/` — kiểu dữ liệu dùng chung
  - `packages/ui/` — thành phần giao diện dùng chung
  - `docs/` — kế hoạch và tài liệu kiến trúc

## Lộ trình

- Phase 0: kiến trúc, mapping endpoint, helper dùng chung (đã chốt)
- Phase 1: auth, danh mục, thương hiệu, sản phẩm + biến thể, các màn
  M01–M03 và M09
- Phase 2: giỏ hàng, địa chỉ, coupon, checkout COD, tồn kho
- Phase 3: lịch sử đơn, huỷ đơn, đánh giá, tài khoản
- Phase 4: admin — dashboard, đơn hàng, kho, coupon, báo cáo
- Phase 5: kiểm thử, responsive, tài liệu vận hành demo

Chi tiết xem `docs/PLAN.md`, `docs/TARGET_ARCHITECTURE.md` và
`docs/ENDPOINT_MAP.md`.

## Trạng thái

Repo vừa được khởi tạo. Code sẽ được đưa vào theo từng phase, mỗi
phase có kiểm chứng và báo cáo riêng trước khi sang phase tiếp theo.
