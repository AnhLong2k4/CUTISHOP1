# CutiShop — Kế hoạch xây lại từ Đặc tả v1.0 (2026-10-24)

Nguồn: poster + văn bản “ĐẶC TẢ YÊU CẦU PHẦN MỀM — CUTISHOP v1.0” do người dùng gửi ngày 2026-10-24.
Trạng thái: ĐÃ LẬP KẾ HOẠCH, CHƯA VIẾT CODE MỚI. Chưa xóa, chưa thay repo cũ, chưa chạm dữ liệu cũ.

## 1. Chốt ngắn gọn từ đặc tả

- Hệ thống: website bán thời trang, mobile-first, tham khảo trải nghiệm Shopee nhưng thương hiệu/code riêng.
- Stack chốt trong đặc tả: React + TypeScript + Vite + React Router + Tailwind, Node.js + Express REST, MongoDB + Mongoose.
- Đối tượng: khách hàng, quản trị.
- Màu: cam/đỏ cam + nền trắng, hiển thị tốt từ 360px, không tràn ngang, có loading/empty/error/success, nút chính dễ bấm.
- Cốt lõi ưu tiên (mục 10): sản phẩm, giỏ hàng, đặt hàng COD, đơn hàng, tồn kho, quản trị, bảo mật.
- Để sau khi lõi ổn định: MoMo/VNPay thật, vận chuyển tự động, chat realtime, livestream, gợi ý AI, tích điểm nâng cao, microservices.
- Không tuyên bố tích hợp thanh toán/email/deploy thật nếu chưa có cấu hình + kiểm thử + bằng chứng.

## 2. Ba quyết định phải chốt trước khi gen code (vì chọn sai sẽ phải viết lại)

1. **Nơi chứa code mới:** repo mới (giữ CUTISHOP cũ làm backup) hay nhánh mới trong repo CUTISHOP hiện tại?
   - Khuyến nghị: repo mới hoặc nhánh `rebuild/` riêng, tuyệt đối không ghi đè main cũ cho tới khi bản mới chạy được.
2. **API:** dùng API mới trong đặc tả (`/api/auth/*`, `/api/products`, `/api/cart`, `/api/orders`, `/api/admin/*`) hay giữ API cũ để tương thích?
   - Khuyến nghị nếu xây lại thật: dùng API mới cho sạch, nhưng phải có bảng map từ API cũ sang API mới trong tài liệu, vì frontend cũ và dữ liệu cũ đang dùng tên khác.
3. **Port backend:** poster ghi 5000, code cũ đã kiểm chứng chạy ở 8081.
   - Khuyến nghị: giữ 8081 cho bản mới (tránh nhầm với tài liệu cũ và CORS 5173/5174 đã cấu hình), trừ khi người dùng muốn đổi hẳn theo poster.

## 3. Xung đột đã thấy giữa đặc tả mới và code/dữ liệu cũ — cần xử lý, không tự ý bỏ qua

- **Tên route:** cũ là `/api/user/*`, `/api/product`, `/api/bill/:id/cancel`; mới là `/api/auth/*`, `/api/products`, `/api/orders/:id/cancel`. Không thể giữ cả hai mà không có lớp tương thích.
- **Trạng thái đơn:** cũ dùng tiếng Việt (“Chờ Xác Nhận”, “Đã Xác Nhận”, …); mới đề xuất Pending/Confirmed/Processing/Shipping/Delivered/Completed/Cancelled/Returned-Refunded. Cần một bảng map duy nhất, backend là nguồn chân lý, không cho chuyển trạng thái tùy ý.
- **“Mobile App (React)” trong sơ đồ kiến trúc:** đặc tả phần 3 yêu cầu website responsive mobile-first, không yêu cầu app native. Hiểu là web responsive, không build app mobile riêng trừ khi người dùng xác nhận thêm.
- **Tồn kho:** mới yêu cầu rõ `stock`, `reserved`, `available = stock - reserved`, InventoryMovements (lý do, thời gian, người thực hiện), giải phóng khi hủy. Code cũ đã có reserve/release trong transaction nhưng chưa chắc có đủ 3 trường + lịch sử kho này — phải kiểm chứng từ model cũ trước khi quyết định giữ hay viết lại model.
- **Dữ liệu cũ:** đặc tả mục 7 nói rõ không tạo collection trùng, không phá dữ liệu cũ khi chưa có kế hoạch migration. Atlas hiện tại người dùng chọn bắt đầu từ database trống, local `tokyolife` giữ nguyên làm rollback — quyết định này vẫn giữ nguyên cho bản xây lại, trừ khi người dùng đổi ý.

## 4. Lộ trình theo phase (mỗi phase xong mới sang phase sau, có checkpoint)

- **Phase 0 — Nền tảng:** chốt 3 quyết định ở mục 2; tạo skeleton (monorepo hoặc 3 thư mục frontend/backend/shared); `.env.example` chỉ tên biến + placeholder; cấu hình lỗi thống nhất, log, CORS, phân trang server, index MongoDB cho trường tìm kiếm.
- **Phase 1 — Tài khoản + danh mục sản phẩm:** đăng ký/đăng nhập/đăng xuất, refresh token HttpOnly, quên/đặt lại mật khẩu, phân quyền role; CRUD danh mục/thương hiệu; sản phẩm + biến thể (SKU, màu, size, giá, giá KM, tồn, ảnh Cloudinary); list có tìm kiếm/lọc/sắp xếp/phân trang server; màn hình M01–M03, M09.
- **Phase 2 — Giỏ + đặt COD + tồn kho:** giỏ theo user + biến thể; địa chỉ; mã giảm giá kiểm chứng ở backend; quote (backend tính lại giá); tạo đơn có idempotency (không tạo 2 đơn khi gửi lại); giữ/trừ tồn kho nguyên tử; màn hình M04–M06.
- **Phase 3 — Đơn khách + hủy + đánh giá:** lịch sử đơn, chi tiết đơn, lịch sử trạng thái, hủy theo đúng điều kiện + giải phóng kho, đổi mật khẩu/thông tin cá nhân, đánh giá sau khi mua thành công; màn hình M07, M08, M10.
- **Phase 4 — Admin:** dashboard dùng dữ liệu thật (không số giả); quản lý sản phẩm/đơn/khách/mã giảm giá; cập nhật trạng thái đơn theo state machine; quản lý kho + lịch sử kho; báo cáo doanh thu theo khoảng thời gian/trạng thái; audit log cho thao tác quan trọng.
- **Phase 5 — Hoàn thiện + kiểm thử + bàn giao:** test nghiệp vụ quan trọng (giá server, không bán vượt tồn, không xem đơn người khác, không gọi được API admin bằng tài khoản thường, không trùng đơn); kiểm tra responsive 360/390/desktop; seed demo (không dùng dữ liệu cá nhân thật); README, tài liệu API, tài khoản demo, hướng dẫn chạy.

## 5. Mô hình dữ liệu mục tiêu (theo mục 7, chốt field/index sau khi đối chiếu code cũ)

Users, Products, ProductVariants, Categories, Brands, Carts, Addresses, Orders, OrderItems, Coupons, InventoryMovements, Reviews, Payments, Notifications (nếu triển khai), AuditLogs.

## 6. Tiêu chí nghiệm thu (theo mục 9, rút gọn)

Đăng ký/đăng nhập/đăng xuất được; tìm/lọc/xem chi tiết đúng; chọn đúng biến thể/số lượng; giỏ + tổng tiền đúng; mã giảm giá kiểm chứng ở backend; tạo đơn COD thành công, không trùng, không vượt tồn; không xem được đơn người khác; hủy đúng quy tắc + kho đúng; admin quản lý được sản phẩm/đơn/kho; tài khoản thường không gọi được API admin; dashboard là số thật; không tràn ngang ở 360px trở lên; đủ trạng thái loading/error/empty/success; test bắt buộc PASS có báo cáo; có hướng dẫn + .env.example + tài khoản demo.

## 7. Guardrails giữ nguyên từ charter trước

Không đọc/in secret; không xóa/reset DB, không migration phá hoại; không force-push, không rewrite history; không merge/push khi chưa kiểm chứng đầy đủ và rõ phạm vi; không tắt auth/validation để test đậu; không báo PASS khi chưa chạy thật; phân biệt PASS/FAIL/BLOCKED/NOT RUN và ghi rõ môi trường kiểm chứng.
