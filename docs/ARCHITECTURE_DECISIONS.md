# CUTISHOP1 — Quyết định kiến trúc (Phase 1)

## ADR-1: Backend TypeScript trên Node.js + Express
Server dùng TypeScript strict, biên dịch bằng tsc, chạy dev bằng tsx.
Lý do: chia sẻ kiểu dữ liệu với frontend qua packages/contracts, bắt
lỗi sớm ở biên API. Frontend React + TypeScript + Vite như đặc tả.

## ADR-2: API có phiên bản /api/v1
Mọi endpoint nằm dưới `/api/v1`. Phiên bản hóa ngay từ đầu rẻ hơn
rất nhiều so với thêm vào sau khi đã có client phụ thuộc.

## ADR-3: Tiền tệ là số nguyên VND
Giá lưu dạng số nguyên (đồng), validate `Number.isInteger` ở cả
zod (biên API) và Mongoose (model). Không dùng số thập phân cho tiền
để tránh sai số floating point.

## ADR-4: Quy tắc giá biến thể
Giá hiệu lực = giá riêng của biến thể nếu có; nếu không, giá khuyến
mãi khi khuyến mãi hợp lệ (salePrice < giá gốc và thời gian hiện tại
nằm trong cửa sổ sale); ngược lại là giá gốc. Khuyến mãi không cộng
dồn lên giá riêng của biến thể. Server tính sẵn `effectivePrice`,
`priceRange`, `onSale` trong mọi phản hồi sản phẩm để client không
tự suy diễn sai lệch.

## ADR-5: Phiên đăng nhập — access token ngắn hạn + refresh xoay vòng
Access token JWT 15 phút, client giữ trong bộ nhớ (không
localStorage). Refresh token JWT 7 ngày trong cookie HttpOnly,
xoay vòng mỗi lần dùng; server lưu bản băm sha256 của refresh
token kèm trạng thái thu hồi. Trình lại refresh token đã bị xoay
vòng/thu hồi = dấu hiệu đánh cắp → thu hồi toàn bộ phiên của tài
khoản. Đổi mật khẩu cũng thu hồi mọi phiên. Cookie đặt
SameSite=Lax và các endpoint dùng cookie yêu cầu header
`X-Requested-With` do client chính chủ gửi — lớp giảm thiểu CSRF
phù hợp mô hình SPA cùng hệ sinh thái origin cho phép.

## ADR-6: Mật khẩu và token đặt lại
Mật khẩu băm bcrypt (bcryptjs, cost mặc định 12 — đo thực tế
~0,5 giây/hash trên môi trường kiểm thử; cấu hình qua BCRYPT_COST).
Reset token ngẫu nhiên 32 byte, chỉ lưu bản băm sha256, hạn 15
phút, dùng một lần. Luồng quên mật khẩu luôn trả cùng một thông
điệp, không tiết lộ email có tồn tại hay không. Lỗi xác thực dùng
đúng mã HTTP (409 trùng email, 401 sai thông tin đăng nhập, 400 dữ
liệu không hợp lệ) — không gom về 500.

## ADR-7: Gửi email qua adapter
Mailer là một interface: SMTP (nodemailer) khi có cấu hình;
ConsoleMailer chỉ ở ngoài production (in liên kết đặt lại vào log
máy chủ phục vụ phát triển local); production thiếu SMTP thì trả
503 EMAIL_NOT_CONFIGURED thay vì giả vờ đã gửi. Token đặt lại
không bao giờ xuất hiện trong phản hồi API.

## ADR-8: Xóa mềm cho sản phẩm, chặn xóa cho danh mục/thương hiệu
DELETE sản phẩm = ngừng bán (isActive=false) để không phá vỡ dữ
liệu tham chiếu về sau. Danh mục/thương hiệu đang được sản phẩm
tham chiếu thì DELETE trả 409 và hướng dẫn ẩn thay vì xóa.

## ADR-9: Tồn kho Phase 1
`variants[].quantity` là nguồn sự thật duy nhất về tồn kho.
Chưa có khái niệm reserved/available — phần đó thuộc Phase 2 khi
có checkout, sẽ thiết kế cùng cơ chế giao dịch và idempotency.

## ADR-10: Kiểm thử tích hợp bằng MongoDB thật (in-memory)
Test tích hợp chạy trên MongoMemoryServer (MongoDB thật trong bộ
nhớ, database riêng cho test) — không mock Mongoose, không chạm
database development/production. Thứ tự sắp xếp theo tên dùng
collation nhị phân mặc định của MongoDB trong Phase 1 (tên bắt
đầu bằng chữ có dấu như "Á" xếp sau chữ Latin thường); nếu cần
thứ tự từ điển tiếng Việt sẽ bổ sung collation ở phase sau.

## ADR-11: Cấu trúc package dùng chung
Chỉ hai package chung có nhu cầu thật ở Phase 1:
`packages/contracts` (kiểu dữ liệu + format tiền) và
`packages/api-client` (client tập trung, tự refresh khi 401).
Không tạo package UI dùng chung ở Phase 1 — theme Tailwind được
khai báo trong từng app; sẽ tách khi admin/storefront thật sự
trùng lặp component.
