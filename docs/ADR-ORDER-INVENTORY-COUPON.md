# ADR cho PR 1 — Đơn hàng, tồn kho, mã giảm giá, idempotency (ĐỀ XUẤT, CHƯA TRIỂN KHAI)

Trạng thái: **Đề xuất chờ duyệt.** Không có code đơn hàng, tồn kho mới,
coupon hay AI nào được viết theo tài liệu này cho tới khi người dùng duyệt.
Tài liệu này nối tiếp ADR-1 đến ADR-11 trong `docs/ARCHITECTURE_DECISIONS.md`
và giữ nguyên các nguyên tắc: tiền là số nguyên VND, giá hiệu lực do server
tính, RBAC kiểm tra ở server, tiền và quyền không tin client.

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
  tiền mới chuyển sang `PAID_ON_DELIVERY`. Hoàn tiền COD là thao tác ghi
  nhận thủ công ngoài hệ thống, không có tích hợp cổng thanh toán.

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
| PROCESSING trở đi | CANCELLED | Không cho khách; admin chỉ được hủy trước SHIPPING với lý do | Giải phóng giữ kho đúng một lần |
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

### 2.3 Thời hạn giữ kho cho COD

Đề xuất:

- Đơn PENDING có `reservationExpiresAt = createdAt + 48 giờ`.
- Hết hạn mà vẫn PENDING thì đơn chuyển sang CANCELLED với lý do
  `RESERVATION_EXPIRED` và giải phóng giữ kho đúng một lần.
- Từ CONFIRMED trở đi, giữ kho không hết hạn, vì cửa hàng đã cam kết
  xử lý đơn. Việc giữ kho dài ở các trạng thái sau là quyết định kinh
  doanh của admin, không phải timeout tự động.
- Cơ chế hết hạn: một job dọn dẹp định kỳ ở server (chạy khi server đang
  chạy, quét đơn PENDING đã quá hạn) **cộng với** kiểm tra lười khi đọc
  đơn: nếu đơn đã quá hạn mà job chưa chạy tới, lần đọc/truy vấn tiếp
  theo vẫn phải thấy đơn ở trạng thái đã hết hạn sau khi job xử lý, và
  không cho chuyển PENDING quá hạn sang CONFIRMED. Job dọn dẹp phải dùng
  cùng cơ chế chống trùng ở mục 3 để chạy nhiều lần cũng an toàn.

Đánh đổi của 48 giờ: đủ dài cho khách COD nghe điện thoại/xác nhận,
đủ ngắn để không khóa kho quá lâu. 24 giờ có thể làm mất đơn COD hợp
lệ; 72 giờ trở lên làm tăng nguy cơ hết hàng ảo cho khách khác.
Con số này là cấu hình, không hard-code sâu trong nhiều nơi, và có thể
đổi sau khi duyệt mà không đổi model.

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

Công thức do server tính, không tin client:

- `PERCENT`: `discount = min(subtotal * value / 100, maxDiscount)`.
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
  Hủy từ các trạng thái sau, giao thất bại rồi hủy, hoặc trả hàng:
  **không tự hoàn coupon**, vì cửa hàng đã tốn chi phí xử lý/vận chuyển.
  Hoàn trong các trường hợp này là quyết định thủ công của admin.
- Mã hết hạn/hết lượt/không đủ đơn tối thiểu: trả lỗi coupon riêng,
  không gộp thành lỗi chung, để frontend hiển thị đúng lý do.

## 5. Idempotency khi tạo đơn

- Client **bắt buộc** gửi `Idempotency-Key` là UUID v4 khi tạo đơn,
  ưu tiên qua header `Idempotency-Key`, chấp nhận field `idempotencyKey`
  trong body làm fallback. Thiếu key trả `400 IDEMPOTENCY_KEY_REQUIRED`.
- Server có unique index `{ user, idempotencyKey }` trên Order.
  Vì key gắn với user, user này không đọc được đơn của user khác qua key.
- Hành vi:
  - Key chưa từng dùng: tạo đơn trong transaction (giữ kho, tiêu thụ
    coupon nếu có, ghi lịch sử). Trả `201` kèm đơn.
  - Key đã dùng, cùng user, cùng payload nghiệp vụ (cùng items, địa
    chỉ, coupon, phương thức): trả `200` kèm đơn cũ, **không tạo đơn
    mới, không giữ kho lần hai, không tiêu thụ coupon lần hai**.
  - Key đã dùng, cùng user, nhưng payload khác: trả `409
    IDEMPOTENCY_KEY_REUSED`, không tạo đơn, không thay đổi đơn cũ.
    Frontend/mobile phải hiểu đây là lỗi lập trình/tái sử dụng key sai,
    không tự retry với cùng key cho một đơn khác.
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
- Test tích hợp: dùng MongoMemoryServer với replica set (cấu hình
  riêng cho test), không dùng standalone in-memory cho test đơn hàng,
  vì test đó sẽ không chứng minh được transaction thật.

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
   áp coupon theo mục 4, tính tổng cuối. Giá client gửi lên chỉ để
   đối chiếu hiển thị, không dùng để tính tiền.
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
| Phí vận chuyển | Chưa chốt trong ADR này — cần quyết trước PR quote | 0 đồng cho demo: đơn giản nhưng không giống thực tế; phí cố định: cần thêm cấu hình và quy tắc miễn phí |
| Guest checkout | Không làm ở Phase 2, bắt buộc đăng nhập | Guest: tiện hơn nhưng tạo đơn mồ côi và khó đối soát |
| Phạm vi coupon | Toàn đơn, 1 mã/đơn | Theo danh mục/sản phẩm, cộng dồn: phức tạp hơn nhiều |
| Job hết hạn giữ kho | Job định kỳ trong server + kiểm tra lười | Job ngoài (cron hệ thống): cần thêm hạ tầng triển khai |

Các quyết định trên, đặc biệt là thời hạn giữ kho, phí vận chuyển và
việc không tự hoàn thành đơn, cần được duyệt cùng ADR này trước khi
viết code PR 2/3/4. Thay đổi các quyết định sau khi đã có đơn thật sẽ
cần migration và thông báo cho đơn đang chờ xử lý.

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

## 10. Checklist nghiệm thu cho PR 2/3/4 (sau khi ADR được duyệt)

- [ ] Tạo đơn hai lần cùng Idempotency-Key chỉ tạo một đơn.
- [ ] Hai đơn đồng thời không bán vượt tồn, tồn kho không âm.
- [ ] Coupon đồng thời không vượt giới hạn tổng và giới hạn/người.
- [ ] Hủy đơn hai lần chỉ giải phóng kho và hoàn coupon một lần.
- [ ] Chuyển trạng thái sai trả 409, user không xem/sửa được đơn người khác.
- [ ] Đơn PENDING quá 48 giờ hết hạn và giải phóng kho đúng một lần.
- [ ] Sửa/xóa SKU đang có đơn chưa kết thúc bị chặn 409.
- [ ] Test tích hợp chạy trên MongoDB replica set (in-memory), không
  phải standalone, cho các trường hợp trên.
- [ ] Không có thay đổi nào ở PR này merge, deploy hay xóa dữ liệu
  khi chưa được duyệt riêng.
