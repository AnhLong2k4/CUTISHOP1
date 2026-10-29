# ADR cho PR 1 — Đơn hàng, tồn kho, mã giảm giá, idempotency (ĐỀ XUẤT, CHƯA TRIỂN KHAI)

Trạng thái: **Đề xuất chờ duyệt (bản sửa lần 2).** Không có code đơn hàng,
tồn kho mới, coupon hay AI nào được viết theo tài liệu này cho tới khi
người dùng duyệt bản sửa này. Tài liệu này nối tiếp ADR-1 đến ADR-11
trong `docs/ARCHITECTURE_DECISIONS.md` và giữ nguyên các nguyên tắc:
tiền là số nguyên VND, giá hiệu lực do server tính, RBAC kiểm tra ở
server, tiền và quyền không tin client.

Bản sửa lần 2 chốt thêm: phí vận chuyển do backend tính theo cấu hình
(mặc định 0 đồng cho demo), thứ tự tính tiền, cơ chế hết hạn giữ kho
khi worker gián đoạn/lặp, phạm vi MVP cho giao thất bại/trả hàng/hoàn
tiền, và checklist kiểm thử chi tiết. Các mục kiểm thử trong tài liệu
này là **yêu cầu chưa viết, chưa chạy** — không được ghi là PASS.

Phạm vi áp dụng: checkout COD, khách đã đăng nhập. Chưa áp dụng cho thanh
toán online, giao vận tự động, guest checkout hay tích điểm.

## 1. Vòng đời đơn hàng

### 1.1 Enum và nhãn

Backend lưu enum tiếng Anh, frontend giữ bảng nhãn tiếng Việt ở một nơi
duy nhất (theo hướng đã chốt ở README). Trạng thái đơn và trạng thái thanh
toán là hai trường riêng, không gộp:

- `status`: trạng thái xử lý đơn.
- `paymentStatus`: `UNPAID` | `PAID_ON_DELIVERY` | `REFUNDED`.
  COD nghĩa là chưa thu tiền khi tạo đơn; chỉ khi giao thành công và thu
  tiền mới chuyển sang `PAID_ON_DELIVERY`. `REFUNDED` trong MVP chỉ là
  **ghi nhận trạng thái sau khi đã hoàn tiền thủ công ngoài hệ thống**,
  không phải tích hợp hoàn tiền, không tự chuyển tiền, không gọi cổng
  thanh toán. Xem phạm vi MVP ở mục 1.4.

### 1.2 Các trạng thái và chuyển đổi hợp lệ

```
PENDING -> CONFIRMED -> PROCESSING -> SHIPPING -> DELIVERED -> COMPLETED
PENDING/CONFIRMED -> CANCELLED
SHIPPING -> DELIVERY_FAILED -> SHIPPING (giao lại) | CANCELLED
DELIVERED -> RETURN_REQUESTED -> RETURNED | DELIVERED (từ chối trả)
RETURNED -> REFUNDED (chỉ khi đã thu tiền trước đó)
```

| Từ | Sang | Ai được phép | Tác dụng phụ bắt buộc |
| --- | --- | --- | --- |
| (tạo mới) | PENDING | Khách đã đăng nhập | Giữ kho, tạo OrderItems snapshot, tiêu thụ coupon nếu có |
| PENDING | CONFIRMED | Admin | Giữ nguyên giữ kho, ghi lịch sử |
| CONFIRMED | PROCESSING | Admin | Giữ nguyên giữ kho |
| PROCESSING | SHIPPING | Admin | Giữ nguyên giữ kho |
| SHIPPING | DELIVERED | Admin | Chuyển giữ kho thành đã bán, `paymentStatus = PAID_ON_DELIVERY` |
| DELIVERED | COMPLETED | Khách (xác nhận đã nhận) hoặc admin | Không đổi kho |
| PENDING, CONFIRMED | CANCELLED | Khách (đơn của mình) hoặc admin | Giải phóng giữ kho đúng một lần, hoàn coupon nếu đủ điều kiện (mục 4) |
| PROCESSING | CANCELLED | Chỉ admin, trước khi sang SHIPPING, kèm lý do | Giải phóng giữ kho đúng một lần, không tự hoàn coupon |
| SHIPPING | CANCELLED | Không được chuyển trực tiếp | Muốn hủy sau khi đã giao vận phải đi qua DELIVERY_FAILED rồi mới CANCELLED, xem mục 1.4 |
| SHIPPING | DELIVERY_FAILED | Admin | Giữ nguyên giữ kho, ghi lý do |
| DELIVERY_FAILED | SHIPPING | Admin | Giao lại, **không giữ kho lần hai** |
| DELIVERY_FAILED | CANCELLED | Admin | Giải phóng giữ kho đúng một lần |
| DELIVERED | RETURN_REQUESTED | Khách, trong 7 ngày kể từ DELIVERED | Không đổi kho |
| RETURN_REQUESTED | RETURNED | Admin sau khi nhận lại hàng | Chỉ nhập lại kho khi admin xác nhận hàng còn bán được (mục 2.4) |
| RETURN_REQUESTED | DELIVERED | Admin khi từ chối trả | Không đổi kho |
| RETURNED | REFUNDED | Admin, chỉ khi `paymentStatus` đã là `PAID_ON_DELIVERY` | Chỉ ghi nhận, không tự chuyển tiền |

Quy tắc chung:

- Mọi chuyển đổi không có trong bảng trên trả `409 ORDER_TRANSITION_INVALID`,
  không âm thầm bỏ qua và không cho client tự đặt trạng thái tùy ý.
- Gửi lại yêu cầu chuyển sang đúng trạng thái hiện tại được coi là no-op
  an toàn và trả về đơn hiện tại (giúp retry không bị lỗi giả).
- Mọi chuyển đổi đều ghi vào lịch sử trạng thái của đơn, do server tạo:
  `{ from, to, by, role, reason, at }`. Lịch sử này chỉ thêm, không sửa,
  không xóa, và không nhận từ client.
- Hủy đơn sau SHIPPING không dùng trạng thái CANCELLED mà dùng luồng trả
  hàng, vì hàng đã rời kho và có thể đã thu tiền.
- Hoàn thành tự động sau DELIVERED (ví dụ tự COMPLETED sau N ngày) **không
  làm ở Phase 2/3**. Lý do: tự động hóa sẽ âm thầm khóa quyền trả hàng
  của khách. Nếu cần, đây là quyết định riêng sau, kèm job và thông báo.

### 1.3 Hủy, giao thất bại, trả hàng — các trường hợp biên

- Khách hủy đơn của người khác: kiểm tra quyền sở hữu ở server, trả 404
  gộp như không tồn tại (không tiết lộ đơn của người khác), không trả 403
  kèm chi tiết.
- Đơn đã CANCELLED/COMPLETED/REFUNDED là trạng thái cuối, không chuyển tiếp.
- Giao thất bại nhiều lần: không giới hạn cứng số lần giao lại ở Phase 2,
  nhưng mỗi lần đều ghi lý do; admin quyết định chuyển sang CANCELLED.
- Trả hàng một phần: **chưa hỗ trợ ở Phase 2/3**. Trả hàng là toàn đơn.
  Trả một phần là tính năng riêng, vì nó kéo theo chia tiền, chia coupon
  và chia kho phức tạp.

### 1.4 Phạm vi MVP cho giao thất bại, trả hàng và hoàn tiền — nói rõ, không giả vờ

MVP hỗ trợ:

- Giao thất bại: trạng thái `DELIVERY_FAILED` kèm lý do do admin nhập,
  sau đó admin chọn giao lại (`SHIPPING`, không giữ kho lần hai) hoặc
  hủy (`CANCELLED`, giải phóng kho đúng một lần). Không có tích hợp
  hãng vận chuyển, không tự cập nhật trạng thái từ đơn vị giao vận.
- Trả hàng: khách yêu cầu toàn đơn trong 7 ngày kể từ `DELIVERED`,
  admin duyệt/từ chối, và chỉ nhập lại kho khi admin xác nhận riêng
  hàng còn bán được (mục 2.4). Không có trả một phần, không tự nhập
  kho, không tự tính tiền trả lại theo từng dòng.
- Hoàn tiền: **không có tích hợp hoàn tiền trong MVP**. `REFUNDED`
  chỉ được admin đặt sau khi đã hoàn tiền thủ công ngoài hệ thống
  (ví dụ chuyển khoản tay) và chỉ khi `paymentStatus` trước đó là
  `PAID_ON_DELIVERY`. Hệ thống không chuyển tiền, không gọi ngân hàng
  hay cổng thanh toán, và không được mô tả trong giao diện/tài liệu
  demo như “đã hoàn tiền tự động”. Nếu cần hoàn tiền tự động, đó là
  quyết định và tích hợp riêng sau, kèm đối soát thanh toán.

Ngoài MVP (chưa làm, chưa tuyên bố có): tích hợp hãng vận chuyển,
theo dõi vận đơn tự động, trả hàng một phần, hoàn tiền tự động,
đổi hàng, và tự động hoàn thành đơn sau giao.

## 2. Giữ kho, thời hạn giữ kho, giải phóng và bán

### 2.1 Mô hình dữ liệu tồn kho (đề xuất)

Phase 1 chỉ có `variants[].quantity` và ADR-9 đã ghi rõ reserved/available
thuộc Phase 2. Đề xuất cho Phase 2:

- `variants[].quantity`: tổng số lượng vật lý đang có.
- `variants[].reserved`: số lượng đang giữ cho các đơn chưa kết thúc
  (PENDING, CONFIRMED, PROCESSING, SHIPPING, DELIVERY_FAILED).
- `available = quantity - reserved`, tính ở server, không lưu trùng và
  không tin giá trị `available` do client gửi.
- Migration cho sản phẩm cũ: `reserved = 0` cho mọi biến thể, vì trước
  Phase 2 chưa có đơn nào giữ kho. `quantity` cũ giữ nguyên ý nghĩa.

### 2.2 Khi nào giữ, khi nào bán, khi nào giải phóng

| Sự kiện | `quantity` | `reserved` | Ghi chú |
| --- | --- | --- | --- |
| Tạo đơn hợp lệ | Không đổi | `+qty` | Chỉ khi `available >= qty` cho mọi dòng |
| Hủy / hết hạn giữ (chỉ PENDING) | Không đổi | `-qty` | Đúng một lần, xem mục 3 |
| Giao thất bại rồi hủy | Không đổi | `-qty` | Đúng một lần |
| Giao thành công (DELIVERED) | `-qty` | `-qty` | Giữ kho chuyển thành đã bán |
| Trả hàng được duyệt + nhập lại kho | `+qty` | Không đổi | Chỉ khi admin xác nhận hàng còn bán được |
| Trả hàng được duyệt + không nhập lại | Không đổi | Không đổi | Hàng hỏng/mất, không tự tăng kho |
| Điều chỉnh kho thủ công (admin, Phase 4) | Theo điều chỉnh | Không đổi trực tiếp | Bắt buộc có lý do và InventoryMovement |

Báo giá (quote) **không giữ kho**. Quote chỉ kiểm tra tồn kho tại thời
điểm báo giá để cảnh báo, còn kiểm tra có tính quyết định chỉ xảy ra
lúc tạo đơn. Nếu không phân biệt hai bước này, quote sẽ khóa kho vô
hạn cho những giỏ hàng không bao giờ thanh toán.

Giao hàng thành công chuyển giữ sang đã bán đúng một lần: chuyển đổi
SHIPPING → DELIVERED phải chạy trong một transaction gồm đổi trạng
thái, trừ cả `quantity` và `reserved`, đặt
`paymentStatus = PAID_ON_DELIVERY`, và ghi InventoryMovement SALE với
key `order:{orderId}:sale`. Điều kiện transaction gắn với
`status = SHIPPING`. Gửi lại yêu cầu DELIVERED khi đơn đã DELIVERED
là no-op trả về đơn hiện tại, không ghi SALE lần hai; nếu movement
bị ghi trùng, unique index trên key sẽ chặn. Ngược lại, không được
trừ `quantity` ở bước SHIPPING, vì lúc đó hàng chưa được xác nhận
đã giao và thu tiền.

### 2.3 Thời hạn giữ kho cho COD — bắt đầu khi nào, hết hạn xử lý ra sao

Đề xuất:

- Thời hạn giữ bắt đầu **tại thời điểm đơn được tạo thành công trong
  transaction**, tức là `createdAt` của đơn sau khi commit, không phải
  lúc tạo giỏ, lúc báo giá, lúc admin mở đơn hay lúc job chạy.
  Trong cùng transaction tạo đơn, server đặt
  `reservationExpiresAt = createdAt + 48 giờ` và giữ kho. Quote không
  tạo thời hạn giữ, vì quote không giữ kho (mục 2.2).
- Hết hạn mà vẫn PENDING thì đơn chuyển sang CANCELLED với lý do
  `RESERVATION_EXPIRED` và giải phóng giữ kho đúng một lần.
- Từ CONFIRMED trở đi, giữ kho không hết hạn, vì cửa hàng đã cam kết
  xử lý đơn. Việc giữ kho dài ở các trạng thái sau là quyết định kinh
  doanh của admin, không phải timeout tự động.
- Đơn PENDING đã hết hạn **không được hồi sinh**: admin không thể
  chuyển nó sang CONFIRMED để “cứu” đơn. Khách muốn mua lại phải tạo
  đơn mới với Idempotency-Key mới; kho và coupon được tính lại từ đầu.

Cơ chế hết hạn và các trường hợp worker gián đoạn/lặp:

- Job dọn dẹp định kỳ ở server, ví dụ mỗi 15 phút (cấu hình, không
  hard-code sâu), quét đơn thỏa mãn đồng thời: `status = PENDING`
  và `reservationExpiresAt <= now`.
- Mỗi đơn hết hạn được xử lý trong **một transaction riêng** gồm:
  chuyển trạng thái PENDING → CANCELLED (lý do `RESERVATION_EXPIRED`),
  giải phóng `reserved`, ghi InventoryMovement RELEASE với key
  `order:{orderId}:release`, và hoàn coupon nếu đủ điều kiện (mục 4.2).
  Điều kiện của transaction phải gắn với trạng thái: chỉ xử lý khi
  đơn vẫn còn PENDING tại thời điểm transaction chạy.
- Worker bị gián đoạn trước khi commit: transaction rollback toàn bộ,
  đơn vẫn PENDING, kho vẫn giữ, job lần sau quét lại và xử lý bình
  thường. Không có trạng thái dở dang.
- Worker bị gián đoạn sau khi commit nhưng trước khi trả kết quả:
  đơn đã CANCELLED và kho đã giải phóng; lần chạy sau không tìm thấy
  đơn PENDING nữa nên không xử lý lại.
- Hai worker/job chạy trùng nhau: worker đầu tiên commit thành công
  sẽ đổi trạng thái sang CANCELLED; worker thứ hai không còn thỏa
  điều kiện `status = PENDING` nên bỏ qua. Nếu cả hai cùng ghi
  movement, unique index trên `idempotencyKey` của movement sẽ chặn
  lần ghi thứ hai. Vì vậy giải phóng chỉ xảy ra đúng một lần ngay cả
  khi job chạy lặp hoặc chạy song song.
- Job chưa chạy tới (server tắt, job trễ): đơn vẫn hiển thị PENDING
  trong database cho tới khi job chạy, nhưng về mặt nghiệp vụ nó đã
  hết hạn. Để không tạo kẽ hở, mọi yêu cầu chuyển PENDING quá hạn
  sang CONFIRMED đều bị chặn với `409 RESERVATION_EXPIRED`, cho tới
  khi job vật chất hóa việc hủy. API đọc đơn không tự đổi trạng thái
  trong lúc đọc (tránh side-effect ẩn trong GET); việc hủy vẫn do job
  thực hiện và ghi lịch sử đầy đủ.
- Job dọn dẹp không được dùng để hủy đơn CONFIRMED trở đi, không được
  tự hoàn coupon ngoài quy tắc mục 4.2, và phải ghi log an toàn
  (order id, lý do, không ghi PII không cần thiết).

Đánh đổi của 48 giờ: đủ dài cho khách COD nghe điện thoại/xác nhận,
đủ ngắn để không khóa kho quá lâu. 24 giờ có thể làm mất đơn COD hợp
lệ; 72 giờ trở lên làm tăng nguy cơ hết hàng ảo cho khách khác.
Con số này là cấu hình, không hard-code sâu trong nhiều nơi, và có thể
đổi sau khi duyệt mà không đổi model — nhưng đổi cấu hình chỉ ảnh
hưởng đơn tạo mới sau đó, không kéo dài thời hạn của đơn đã tạo.

### 2.4 Nhập lại kho khi trả hàng

Không tự động nhập lại kho khi đơn chuyển sang RETURNED. Admin phải xác
nhận riêng “hàng còn bán được” thì mới tăng `quantity`. Lý do: hàng trả
có thể hỏng, thiếu phụ kiện hoặc sai mẫu; tự tăng kho sẽ bán lại hàng
không bán được. Nếu admin không xác nhận, kho giữ nguyên và cần ghi lý
do trong InventoryMovement.

## 3. Mỗi thay đổi tồn kho chỉ ghi nhận đúng một lần

### 3.1 InventoryMovement là nhật ký, không phải nguồn tính kho lúc checkout

Mỗi thay đổi kho tạo một `InventoryMovement`:

```
{
  productId, sku, orderId?,
  type: RESERVE | RELEASE | SALE | RESTOCK | ADJUST,
  deltaReserved, deltaQuantity,
  idempotencyKey, reason, actor, createdAt
}
```

- `idempotencyKey` có unique index. Với đơn hàng, key có dạng xác định:
  `order:{orderId}:reserve`, `order:{orderId}:release`,
  `order:{orderId}:sale`. Gửi lại cùng một chuyển đổi với cùng key sẽ
  gặp unique index và bị chặn, không trừ/giải phóng lần hai.
- Chuyển đổi trạng thái + thay đổi kho + ghi movement phải nằm trong
  **cùng một MongoDB transaction**. Hoặc cả ba cùng commit, hoặc cả ba
  cùng rollback. Không được ghi movement sau khi transaction đã commit
  theo cách “cố gắng sau”, vì lỗi ở bước sau sẽ làm lệch sổ.
- Kho hiện tại (`quantity`, `reserved`) là nguồn sự thật lúc checkout,
  không phải tổng cộng dồn từ movement. Movement dùng để đối soát và
  kiểm toán, không dùng để tính `available` trong đường nóng tạo đơn.
- Điều chỉnh kho thủ công cũng phải qua movement, có lý do và người
  thực hiện, và không được sửa trực tiếp `reserved`.

### 3.2 Các đường retry và cách chúng an toàn

- Client retry tạo đơn: xem mục 5 (Idempotency-Key của đơn).
- Retry transaction do lỗi transient của MongoDB: driver/Mongoose retry
  commit, và key của movement ngăn việc áp dụng hai lần nếu transaction
  thực ra đã commit nhưng client tưởng là lỗi.
- Retry job hết hạn giữ kho: job quét lại đơn đã xử lý sẽ thấy đơn
  không còn PENDING, hoặc gặp unique key của movement RELEASE, nên
  không giải phóng lần hai.
- Retry chuyển trạng thái của admin: nếu đơn đã ở trạng thái đích, trả
  về đơn hiện tại (no-op) thay vì áp dụng lại tác dụng phụ.

## 4. Mã giảm giá

### 4.1 Trường và quy tắc kiểm tra

Coupon lưu ở server, client chỉ gửi mã, không gửi mức giảm:

- `code`: lưu dạng chữ hoa, unique, so sánh không phân biệt hoa thường,
  trim khoảng trắng.
- `type`: `PERCENT` | `FIXED`.
- `value`: phần trăm (1–100) hoặc số tiền VND nguyên.
- `maxDiscount`: áp cho loại PERCENT, bắt buộc để tránh giảm không giới hạn.
- `minOrderAmount`: áp trên subtotal (tổng giá hiệu lực sau sale, trước
  giảm giá và trước phí vận chuyển).
- `startsAt`, `endsAt`, `isActive`.
- `usageLimitTotal`, `usageLimitPerUser`, `usedCount`.
- Phạm vi Phase đầu: áp cho toàn đơn. Phạm vi theo danh mục/sản phẩm
  là tính năng riêng sau, vì nó kéo theo kiểm tra từng dòng và chia
  giảm giá phức tạp.

Công thức do server tính, không tin client. Thứ tự tính đầy đủ xem
mục 4.3 (subtotal → discount → shipping → total):

- `PERCENT`: `discount = min(floor(subtotal * value / 100), maxDiscount,
  subtotal)`, tính bằng số nguyên, không dùng số thập phân.
- `FIXED`: `discount = min(value, subtotal)`.
- Tổng tiền không bao giờ âm; `discount <= subtotal`.
- **Một đơn chỉ dùng một mã.** Không cộng dồn nhiều mã ở Phase đầu.

### 4.2 Khi nào kiểm tra, khi nào tiêu thụ, khi nào hoàn

- Lúc báo giá: kiểm tra coupon và trả về mức giảm dự kiến, nhưng
  **không tiêu thụ lượt dùng**. Quote không khóa coupon.
- Lúc tạo đơn: kiểm tra lại toàn bộ trong cùng transaction tạo đơn,
  rồi mới tiêu thụ. Lý do: giữa quote và tạo đơn, coupon có thể hết
  hạn hoặc hết lượt.
- Tiêu thụ trong transaction: tăng `usedCount` có điều kiện
  `usedCount < usageLimitTotal`, đồng thời tạo `CouponRedemption`
  `{ coupon, user, order, status: USED }` với unique index theo order.
  Nếu hai đơn đồng thời cùng dùng mã sắp hết lượt, điều kiện và
  transaction sẽ làm một đơn thành công, đơn còn lại trả lỗi coupon
  hết lượt, không vượt giới hạn.
- Giới hạn theo người: đếm số `CouponRedemption` còn hiệu lực của
  user cho mã đó trong cùng transaction. Đếm ngoài transaction sẽ
  race và vượt giới hạn.
- Hoàn coupon khi hủy: chỉ hoàn khi hủy từ PENDING/CONFIRMED, trong
  cùng transaction hủy đơn + giải phóng kho. Khi đó `usedCount - 1`
  và `CouponRedemption` chuyển sang `VOIDED` (không xóa, để đối soát).
  Điều kiện hoàn gắn với trạng thái redemption: chỉ chuyển
  `USED → VOIDED` mới được trừ `usedCount`. Hủy lặp (đơn đã CANCELLED,
  redemption đã VOIDED, hoặc job hết hạn chạy lại) là no-op và không
  trừ thêm lần nào. Hủy từ các trạng thái sau, giao thất bại rồi hủy,
  hoặc trả hàng: **không tự hoàn coupon**, vì cửa hàng đã tốn chi phí
  xử lý/vận chuyển. Hoàn trong các trường hợp này là quyết định thủ
  công của admin, phải ghi lý do và không được tự động hóa âm thầm.
- Mã hết hạn/hết lượt/không đủ đơn tối thiểu: trả lỗi coupon riêng,
  không gộp thành lỗi chung, để frontend hiển thị đúng lý do.

### 4.3 Thứ tự tính tiền và phí vận chuyển — backend tính, quote và đơn dùng chung một quy tắc

Tất cả giá sản phẩm, giảm giá và phí vận chuyển đều do backend tính.
Client chỉ gửi items (product + SKU + số lượng), mã coupon (nếu có)
và địa chỉ giao hàng. Giá, mức giảm hay phí vận chuyển do client gửi
lên (nếu có) đều bị bỏ qua, không dùng để tính tiền và không dùng
để đối chiếu làm thay đổi tổng tiền.

Thứ tự tính, áp dụng giống nhau cho quote và tạo đơn:

1. **Subtotal**: tổng của từng dòng `effectivePrice × quantity`, trong
   đó `effectivePrice` theo ADR-4 (giá riêng của biến thể thắng, sale
   không cộng dồn). Tất cả là số nguyên VND.
2. **Discount**: nếu có coupon hợp lệ, tính theo mục 4.1. Với loại
   PERCENT, dùng phép chia nguyên làm tròn xuống:
   `floor(subtotal × value / 100)`, sau đó chặn bởi `maxDiscount`
   và bởi `subtotal`. Không dùng số thập phân, không làm tròn lên,
   không làm tròn “một nửa lên”, vì VND không có đơn vị nhỏ hơn 1
   đồng và quy tắc phải tái lập được đúng một kết quả duy nhất.
   Không có coupon thì `discount = 0`.
3. **Subtotal sau giảm**: `subtotalAfterDiscount = subtotal - discount`.
4. **Shipping**: tính bằng cùng một hàm server
   `calculateShipping(subtotalAfterDiscount, shippingConfig)` cho cả
   quote và tạo đơn (xem cấu hình bên dưới). Phí vận chuyển không
   tham gia kiểm tra `minOrderAmount` của coupon; điều kiện tối thiểu
   của coupon chỉ xét trên `subtotal` ở bước 1.
5. **Total**: `total = subtotalAfterDiscount + shipping`. Total không
   bao giờ âm vì `discount <= subtotal` và `shipping >= 0`.

Phản hồi quote và đơn đều phải trả về bảng phân tách đầy đủ:
`subtotal`, `discount`, `shipping`, `total`, kèm mã coupon đã áp
(nếu có) và từng dòng đã snapshot giá. Frontend chỉ hiển thị các số
này, không tự tính lại tổng tiền để hiển thị thay thế.

Cấu hình phí vận chuyển (server, không sửa frontend):

- Biến môi trường server, validate bằng zod fail-fast như các biến
  hiện có: `SHIPPING_FEE_VND` (số nguyên VND, `>= 0`, mặc định `0`)
  và `SHIPPING_FREE_THRESHOLD_VND` (tùy chọn; nếu đặt và lớn hơn 0
  thì đơn có `subtotalAfterDiscount >= threshold` được miễn phí).
- Mặc định cho demo: `SHIPPING_FEE_VND = 0`, không đặt threshold,
  nên `shipping = 0` cho mọi đơn. Đây là lựa chọn demo, không phải
  quy tắc kinh doanh vĩnh viễn.
- Quy tắc khi có cấu hình khác 0: nếu `subtotalAfterDiscount` đạt
  ngưỡng miễn phí thì `shipping = 0`, ngược lại
  `shipping = SHIPPING_FEE_VND`. Không có tính phí theo khu vực,
  cân nặng hay hãng vận chuyển trong MVP.
- Cách thay đổi mà không sửa frontend: sửa giá trị trong
  `Server/.env` (hoặc biến môi trường của môi trường chạy) rồi khởi
  động lại backend. Frontend không chứa hằng số phí, không hard-code
  ngưỡng miễn phí, và không cần deploy lại khi đổi cấu hình này.
  Tài liệu vận hành phải ghi rõ hai biến trên; không được hướng dẫn
  sửa phí trong code frontend.
- Quote chỉ là ước tính tại thời điểm báo giá. Nếu cấu hình phí thay
  đổi giữa lúc quote và lúc tạo đơn, đơn sẽ dùng quy tắc và giá tại
  thời điểm tạo đơn, và tổng tiền của đơn là con số có hiệu lực.
  Frontend phải hiển thị tổng tiền cuối ở bước xác nhận đơn, không
  được cam kết rằng tổng tiền ở quote sẽ không đổi khi cấu hình
  server thay đổi. Trong điều kiện vận hành bình thường (cấu hình
  không đổi giữa hai bước), quote và đơn cho cùng giỏ hàng phải ra
  cùng một bảng tính.

## 5. Idempotency khi tạo đơn

- Client **bắt buộc** gửi `Idempotency-Key` là UUID v4 khi tạo đơn,
  ưu tiên qua header `Idempotency-Key`, chấp nhận field `idempotencyKey`
  trong body làm fallback. Thiếu key hoặc key không đúng định dạng
  UUID trả `400 IDEMPOTENCY_KEY_REQUIRED`.
- Server có unique index `{ user: 1, idempotencyKey: 1 }` trên Order.
  Key gắn với user: user khác dùng cùng key vẫn được coi là key mới
  của riêng user đó, và không bao giờ đọc được đơn của user khác qua
  key. Kiểm tra quyền sở hữu vẫn áp dụng như mọi API đơn hàng khác.
- “Cùng payload” được định nghĩa bằng fingerprint nghiệp vụ, không
  phải so sánh chuỗi JSON thô: danh sách items đã sắp xếp theo
  `(productId, sku)` với số lượng từng dòng, địa chỉ giao hàng đã
  chuẩn hóa (trim, không phân biệt khoảng trắng thừa), mã coupon đã
  chuẩn hóa chữ hoa (hoặc null), và phương thức COD. Phí vận chuyển
  và tổng tiền **không** nằm trong fingerprint, vì chúng do server
  tính lại; nếu cấu hình phí thay đổi, đơn cũ vẫn được trả về nguyên
  trạng, không định giá lại.
- Hành vi:
  - Key chưa từng dùng: tạo đơn trong transaction (giữ kho, tiêu thụ
    coupon nếu có, ghi lịch sử, tính tiền theo mục 4.3). Trả `201`
    kèm đơn và bảng tính.
  - Key đã dùng, cùng user, cùng fingerprint: trả `200` kèm đơn cũ
    và bảng tính gốc, **không tạo đơn mới, không giữ kho lần hai,
    không tiêu thụ coupon lần hai, không tính lại giá**.
  - Key đã dùng, cùng user, nhưng fingerprint khác: trả `409
    IDEMPOTENCY_KEY_REUSED`, không tạo đơn, không thay đổi đơn cũ.
    Frontend/mobile phải hiểu đây là lỗi tái sử dụng key sai,
    không tự retry với cùng key cho một đơn khác; muốn đặt đơn khác
    phải sinh key mới.
- Xử lý race khi hai request cùng key gửi đồng thời: cả hai đều kiểm
  tra trước, nhưng chỉ một transaction insert thành công nhờ unique
  index; request thua sẽ bắt lỗi trùng key, đọc lại đơn đã tạo, rồi
  so fingerprint để trả `200` (cùng payload) hoặc `409` (khác
  payload). Không được biến lỗi unique index thành lỗi 500 chung.
- Client phải giữ nguyên key trong suốt quá trình retry của một lần
  đặt hàng (kể cả khi mất mạng rồi gửi lại). Tạo key mới cho mỗi lần
  retry sẽ phá vỡ toàn bộ cơ chế này — đây là lỗi phổ biến nhất và
  phải được kiểm tra bằng test: gửi cùng key hai lần chỉ tạo một đơn.
- Key được giữ vĩnh viễn cùng đơn (đơn là hồ sơ vĩnh viễn), không xóa
  sau TTL. Việc này tránh trường hợp retry muộn tạo trùng đơn sau khi
  key đã bị xóa.
- Idempotency cho chuyển trạng thái xem mục 1.2 (no-op khi đã ở đích)
  và mục 3 (movement key).

## 6. Transaction MongoDB, replica set và chống bán vượt tồn

### 6.1 Yêu cầu replica set — không có đường lùi âm thầm

- Transaction đa document của MongoDB **chỉ chạy trên replica set**,
  kể cả replica set một node. MongoDB standalone sẽ báo lỗi và code
  tạo đơn phải **fail rõ ràng**, không tự chuyển sang ghi không có
  transaction, vì ghi không có transaction sẽ phá vỡ tính nguyên tử
  giữa đơn, kho và coupon.
- Môi trường demo/chạy local: chạy `mongod --replSet rs0` và
  `rs.initiate()` một lần, hoặc dùng MongoDB Atlas (mặc định là
  replica set). Tài liệu chạy demo phải ghi rõ bước này; không được
  ghi “chỉ cần MongoDB đang chạy” chung chung cho Phase đơn hàng.
- Phạm vi transaction cho tạo đơn (một transaction duy nhất, không
  tách nhỏ): kiểm tra idempotency, giữ kho từng dòng, tính tiền
  (mục 4.3), tạo Order + OrderItems snapshot + lịch sử PENDING,
  ghi InventoryMovement RESERVE, và tạo CouponRedemption nếu có.
  Tương tự, hủy/hết hạn, giao thành công và hoàn coupon (nếu đủ điều
  kiện) mỗi sự kiện cũng là một transaction riêng của chính sự kiện
  đó, không gộp nhiều sự kiện vào một transaction.
- Retry transaction: khi gặp lỗi transient của MongoDB
  (`TransientTransactionError`, lỗi commit không xác định), retry
  toàn bộ transaction tối đa 3 lần, mỗi lần chạy lại từ đầu với cùng
  Idempotency-Key và cùng movement key. Vì các ghi đã commit (nếu có)
  sẽ bị unique index chặn khi chạy lại, retry không tạo trùng đơn,
  không giữ kho lần hai và không tiêu thụ coupon lần hai. Nếu lỗi
  không phải transient (ví dụ hết hàng, coupon hết lượt, payload sai),
  không retry transaction mà trả lỗi nghiệp vụ ngay. Nếu transaction
  abort, client có thể retry với cùng key; đơn chưa từng được tạo
  trong lần abort đó nên lần retry hợp lệ sẽ tạo đơn đầu tiên.
- Kiểm thử local với replica set (hướng dẫn cho PR 2/3/4, chưa chạy):
  1. Khởi động MongoDB local dạng replica set một node, ví dụ
     `mongod --replSet rs0 --dbpath <thư mục dữ liệu>`, rồi vào
     `mongosh` chạy `rs.initiate()` một lần.
  2. Đặt `MONGO_URI` dạng có `replicaSet`, ví dụ
     `mongodb://127.0.0.1:27017/cutishop1?replicaSet=rs0`
     (Atlas thì dùng chuỗi Atlas cấp, vốn đã là replica set).
  3. Kiểm tra nhanh: tạo đơn thật trên database test riêng và xác
     nhận transaction commit; sau đó thử chạy cùng code với MongoDB
     standalone và xác nhận nó fail rõ ràng thay vì âm thầm ghi không
     có transaction.
  4. Test tích hợp: cấu hình MongoMemoryServer ở chế độ replica set
     riêng cho test đơn hàng (thay đổi helper test trong PR đó, chưa
     làm ở PR này), không dùng standalone in-memory cho test đơn
     hàng, vì test đó sẽ không chứng minh được transaction thật.

### 6.2 Thuật toán tạo đơn trong transaction (tóm tắt)

1. Validate zod: items, địa chỉ, coupon (nếu có), Idempotency-Key.
2. Kiểm tra key đã dùng chưa (mục 5). Nếu đã dùng thì trả đơn cũ
   hoặc 409, dừng ngay.
3. Mở transaction. Trong transaction, với mỗi dòng:
   - Tìm sản phẩm đang bán (`isActive = true`) và biến thể theo SKU.
   - Kiểm tra `available = quantity - reserved >= qty`. Biến thể là
     subdocument không có `_id` riêng, nên cập nhật bằng arrayFilters
     theo `sku`, ví dụ cập nhật `variants.$[v].reserved` với điều
     kiện `v.sku = sku`. Pattern này phải có test riêng, không được
     giả định Mongoose tự hiểu.
   - Tăng `reserved` có điều kiện; nếu bất kỳ dòng nào không đủ, abort
     toàn bộ transaction và trả `409 INSUFFICIENT_STOCK` kèm danh
     sách SKU thiếu. Không tạo đơn một phần.
4. Tính lại toàn bộ tiền từ giá hiệu lực tại thời điểm tạo đơn
   (theo ADR-4: giá riêng của biến thể thắng, sale không cộng dồn),
   áp coupon và phí vận chuyển theo đúng thứ tự mục 4.3. Giá, mức
   giảm hay phí vận chuyển client gửi lên đều bị bỏ qua, không dùng
   để tính tiền.
5. Tạo Order + OrderItems snapshot + lịch sử PENDING + movement
   RESERVE + CouponRedemption (nếu có) trong cùng transaction.
6. Commit. Nếu gặp lỗi transient của transaction, retry toàn bộ
   transaction tối đa 3 lần; idempotency key và movement key bảo vệ
   việc retry không tạo trùng.

### 6.3 Các trường hợp retry và lỗi cần test

- Gửi tạo đơn hai lần cùng key: 1 đơn.
- Hai đơn đồng thời cho biến thể chỉ còn đủ cho một đơn: 1 thành công,
  1 trả `409 INSUFFICIENT_STOCK`, tồn kho không âm.
- Hai đơn đồng thời dùng coupon chỉ còn 1 lượt: 1 thành công, 1 lỗi
  coupon, `usedCount` không vượt giới hạn.
- Hủy đơn hai lần (client retry + job dọn dẹp cùng chạy): kho chỉ
  giải phóng một lần, coupon chỉ hoàn một lần (nếu đủ điều kiện).
- Transaction abort giữa chừng: không có đơn mồ côi, không có giữ kho
  mồ côi, không có redemption mồ côi.
- Index cần có trước khi triển khai: Order `{ user, idempotencyKey }`
  unique, `{ user, createdAt }`, `{ status, createdAt }`;
  InventoryMovement `{ idempotencyKey }` unique,
  `{ productId, sku, createdAt }`; Coupon `{ code }` unique;
  CouponRedemption `{ order }` unique, `{ coupon, user, status }`.

## 7. SKU đang được đơn hàng tham chiếu và việc sửa/xóa biến thể

### 7.1 OrderItems là snapshot, không phải tham chiếu sống

Khi tạo đơn, mỗi dòng lưu snapshot: `productId`, `sku`, `title`,
`color`, `size`, giá đơn vị hiệu lực tại thời điểm tạo, số lượng.
Nhờ snapshot, việc sửa sản phẩm sau này không viết lại lịch sử đơn,
và đơn vẫn đọc được ngay cả khi sản phẩm đã ngừng bán.

### 7.2 Quy tắc sửa/xóa biến thể

- Đổi tên/giá/ảnh/danh mục sản phẩm: được phép, chỉ ảnh hưởng đơn
  tương lai. Đơn đã tạo giữ nguyên snapshot, không định giá lại.
  Đặc biệt, đổi giá sau khi đơn PENDING đã tạo cũng không đổi giá
  của đơn đó.
- Đổi `quantity` của biến thể: được phép, nhưng không được đặt
  `quantity < reserved`. Nếu không, `available` sẽ âm và các đơn
  đang giữ kho sẽ không còn hàng thật để giao. Vi phạm trả 409.
- Xóa một biến thể (SKU) khỏi sản phẩm: **bị chặn 409
  `SKU_IN_USE_BY_ORDER`** nếu SKU đó xuất hiện trong bất kỳ đơn nào
  chưa kết thúc (PENDING, CONFIRMED, PROCESSING, SHIPPING,
  DELIVERY_FAILED, RETURN_REQUESTED). Chỉ được xóa khi SKU chỉ còn
  trong đơn đã kết thúc (COMPLETED, CANCELLED, RETURNED, REFUNDED),
  và snapshot trong đơn vẫn giữ nguyên.
- Đổi tên SKU: coi như xóa + thêm, áp cùng quy tắc chặn trên.
- Tái sử dụng SKU: **không được tái sử dụng SKU từng xuất hiện trong
  bất kỳ OrderItem nào** cho một sản phẩm/biến thể khác, kể cả khi
  biến thể cũ đã bị xóa khỏi catalog. Trước khi cho phép SKU mới,
  server phải kiểm tra OrderItems. Lý do: SKU là định danh đối soát;
  tái sử dụng sẽ làm lịch sử đơn, kho và báo cáo không còn truy vết
  được đúng sản phẩm.
- Xóa mềm sản phẩm (`isActive = false`, đã có ở Phase 1): vẫn được
  phép ngay cả khi còn đơn chưa kết thúc, vì sản phẩm ngừng bán chỉ
  ẩn khỏi catalog công khai, còn đơn và snapshot vẫn nguyên. Tuy
  nhiên giao diện admin phải cảnh báo nếu sản phẩm còn đơn chưa kết
  thúc, để admin không vô tình ngừng bán sản phẩm đang có đơn chờ giao.
- Sửa `reserved` trực tiếp qua form sản phẩm: **không cho phép**.
  `reserved` chỉ thay đổi qua vòng đời đơn hoặc điều chỉnh kho có
  movement và lý do.

## 8. Đánh đổi và các quyết định còn mở (cần duyệt cùng ADR này)

| Quyết định | Đề xuất | Đánh đổi / phương án khác |
| --- | --- | --- |
| Thời hạn giữ PENDING | 48 giờ | 24 giờ: ít khóa kho hơn nhưng dễ mất đơn COD; 72 giờ: ngược lại |
| Hoàn thành sau giao | Thủ công, không tự động | Tự động sau N ngày: tiện nhưng khóa quyền trả hàng âm thầm |
| Trả hàng | Toàn đơn, 7 ngày, nhập kho thủ công | Trả một phần: cần chia tiền/coupon/kho, làm sau |
| Phí vận chuyển | **Đã chốt ở bản sửa lần 2 (mục 4.3)**: backend tính theo cấu hình `SHIPPING_FEE_VND` và `SHIPPING_FREE_THRESHOLD_VND`, mặc định demo 0 đồng, đổi qua biến môi trường server không cần sửa frontend | Phí theo khu vực/cân nặng/hãng vận chuyển: làm riêng sau, không thuộc MVP |
| Guest checkout | Không làm ở Phase 2, bắt buộc đăng nhập | Guest: tiện hơn nhưng tạo đơn mồ côi và khó đối soát |
| Phạm vi coupon | Toàn đơn, 1 mã/đơn | Theo danh mục/sản phẩm, cộng dồn: phức tạp hơn nhiều |
| Job hết hạn giữ kho | Job định kỳ trong server + kiểm tra lười | Job ngoài (cron hệ thống): cần thêm hạ tầng triển khai |

Các quyết định trên, đặc biệt là thời hạn giữ kho, phí vận chuyển
(đã chốt mặc định demo ở bản sửa lần 2) và việc không tự hoàn thành
đơn, cần được duyệt cùng ADR này trước khi viết code PR 2/3/4. Thay
đổi các quyết định sau khi đã có đơn thật sẽ cần migration và thông
báo cho đơn đang chờ xử lý.

## 9. Thiết kế song song ở mức tài liệu (chưa triển khai)

Phần này chỉ là thiết kế để không phải sửa kiến trúc sau, không tạo
module giả và không được tính là tính năng đã hoàn thành.

### 9.1 Mobile (Expo, Android)

- App riêng `apps/mobile` (Expo + React Native), dùng chung backend
  `/api/v1` và `packages/contracts`. Không dùng mock data.
- Auth mobile khác web: access token lưu trong bộ nhớ, refresh token
  lưu bằng SecureStore (không lưu token ở AsyncStorage thường, không
  dùng cookie trình duyệt). Giữ nguyên xoay vòng refresh và thu hồi
  khi dùng lại như ADR-5; khi 401 thì refresh một lần, thất bại thì
  đăng xuất và xóa token đã lưu.
- CORS: client native không gửi Origin như trình duyệt; server hiện
  đã cho phép request không có Origin, nhưng phải kiểm tra lại khi
  thêm origin của Metro/Expo dev.
- Milestone độc lập: scaffold + auth + catalog trước, rồi giỏ/checkout/
  đơn sau khi API đơn ổn định. Demo trên Android emulator hoặc thiết
  bị Android thật, kèm hướng dẫn chạy; không tuyên bố mobile hoàn
  thành khi chỉ chạy được trên web.

### 9.2 AI (adapter ở server, tắt mặc định)

- Adapter ở server: `AiProvider` với các bản triển khai Noop (khi tắt)
  và provider tương thích OpenAI (khi được cấu hình và duyệt riêng).
  API key chỉ ở biến môi trường server, không vào bundle web/mobile.
- Shopping assistant: truy vấn catalog thật trước (lọc theo từ khóa,
  danh mục, ngân sách), LLM chỉ xếp hạng và viết tóm tắt từ kết quả
  đó; phản hồi cuối phải đối chiếu lại giá/tồn kho từ database trước
  khi gửi. Không có sản phẩm phù hợp hoặc provider lỗi thì trả lời
  an toàn, không bịa sản phẩm, giá hay chính sách.
- Product content assistant: nhận thuộc tính thật của sản phẩm, trả
  bản nháp tiêu đề/mô tả/tags; admin xem và xác nhận mới lưu.
- Admin analytics: tính toán trước bằng aggregation trên dữ liệu
  thật (doanh thu, đơn, tồn kho theo khoảng thời gian), LLM chỉ tóm
  tắt các con số đã tính; mọi con số trong phản hồi phải kèm khoảng
  thời gian và nguồn dữ liệu.
- Giới hạn: feature flag `AI_ENABLED=false` mặc định, timeout,
  giới hạn token/output, rate limit riêng, log token/chi phí nhưng
  không log nội dung chứa PII hay key. Chưa kích hoạt dịch vụ tính
  phí khi chưa được duyệt riêng.

## 10. Checklist kiểm thử cho PR 2/3/4 (sau khi ADR được duyệt)

Trạng thái của toàn bộ checklist này: **CHƯA VIẾT, CHƯA CHẠY, KHÔNG
CÓ MỤC NÀO ĐƯỢC GHI LÀ PASS**. Các mục dưới đây là yêu cầu kiểm thử
phải có trong PR 2/3/4, không phải bằng chứng đã kiểm chứng. Khi báo
cáo PR sau, mỗi mục phải kèm lệnh đã chạy và kết quả thật, phân biệt
rõ PASS / FAIL / BLOCKED / NOT RUN, và không được ghi test tích hợp
là PASS nếu MongoDB in-memory tải thất bại hay job CI chưa chạy.

Kiểm thử bắt buộc theo yêu cầu duyệt ADR lần 2:

- [ ] **Đặt đơn trùng (idempotency):** gửi tạo đơn hai lần cùng user,
  cùng Idempotency-Key và cùng fingerprint → chỉ tạo một đơn, lần hai
  trả `200` kèm đơn cũ, kho và coupon không thay đổi lần hai.
- [ ] **Cùng key nhưng payload khác:** gửi cùng key với giỏ hàng khác
  → trả `409 IDEMPOTENCY_KEY_REUSED`, không tạo đơn mới, đơn cũ
  không đổi.
- [ ] **Client sửa giá / sửa phí / sửa giảm giá:** gửi tổng tiền, mức
  giảm và phí vận chuyển sai từ client → server vẫn tính đúng theo
  mục 4.3, tổng tiền trả về không theo số client gửi.
- [ ] **Hết hạn giữ kho:** tạo đơn PENDING, tua thời gian quá
  `reservationExpiresAt` (bằng cấu hình test hoặc dữ liệu test, không
  chờ 48 giờ thật) → job hết hạn chuyển đơn sang CANCELLED, giải
  phóng kho đúng một lần; thử chuyển đơn đã hết hạn sang CONFIRMED
  → trả `409 RESERVATION_EXPIRED`; job chạy lặp lần hai không giải
  phóng thêm.
- [ ] **Hai khách tranh sản phẩm cuối:** hai đơn đồng thời cho biến
  thể chỉ còn đủ cho một đơn → một đơn thành công, một đơn trả
  `409 INSUFFICIENT_STOCK`, tồn kho không âm, không có đơn một phần.
- [ ] **Coupon hết lượt:** hai đơn đồng thời dùng coupon chỉ còn
  1 lượt → một đơn thành công, một đơn lỗi coupon, `usedCount`
  không vượt giới hạn tổng và giới hạn/người.
- [ ] **Hủy đơn lặp:** hủy cùng một đơn hai lần (kể cả client retry
  và job hết hạn cùng chạy) → kho chỉ giải phóng một lần, coupon
  (nếu đủ điều kiện hoàn) chỉ hoàn một lần, lần hai là no-op.
- [ ] **Giao hàng lặp:** gửi chuyển SHIPPING → DELIVERED hai lần →
  chỉ ghi một movement SALE, `quantity` và `reserved` chỉ trừ một
  lần, `paymentStatus` vẫn là `PAID_ON_DELIVERY`, lần hai trả về
  đơn hiện tại.
- [ ] **Người dùng xem đơn của người khác:** user A gọi chi tiết đơn
  của user B → trả 404 gộp như không tồn tại, không tiết lộ thông
  tin đơn; user thường gọi API admin → 401/403 theo đúng phân quyền.

Kiểm thử bổ sung vẫn giữ từ bản ADR đầu:

- [ ] Chuyển trạng thái sai trả 409, không cho chuyển ngược trạng thái.
- [ ] Sửa/xóa SKU đang có đơn chưa kết thúc bị chặn 409; tái sử dụng
  SKU từng có trong OrderItem bị chặn.
- [ ] Transaction abort giữa chừng: không có đơn mồ côi, không có giữ
  kho mồ côi, không có redemption mồ côi.
- [ ] Test tích hợp chạy trên MongoDB replica set (in-memory), không
  phải standalone, cho các trường hợp trên; thử trên standalone phải
  fail rõ ràng thay vì âm thầm ghi không có transaction.
- [ ] Không có thay đổi nào ở PR này merge, deploy hay xóa dữ liệu
  khi chưa được duyệt riêng.
