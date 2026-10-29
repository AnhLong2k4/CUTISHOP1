# CutiShop Mobile — Phase 2A: Cart — Báo cáo

Ngày: 2026-10-28. Nhánh làm việc: `feat/mobile-phase2a-cart`.
Chưa merge, chưa deploy, chưa xóa nhánh/dữ liệu, chưa dùng dịch vụ trả phí.
Không có API backend mới, không có dependency mới trong phase này.

## 1. Kết luận về nền nhánh — bằng chứng trước khi sửa code

Yêu cầu của phase này là làm việc trên nhánh mới từ `main` mới nhất
và không lấy nhánh cũ làm nền nếu chưa xác minh nó chứa các thay đổi
cần thiết. Kiểm tra thực tế ngày 2026-10-28:

- `origin/main` mới nhất là `a4a440d` (Merge PR #3: CI workflow 26 dòng
  + đồng bộ tài liệu Phase 1). Lệnh `git ls-tree origin/main` cho thấy
  **0 file** thuộc `apps/mobile` và **0 file** thuộc backend cart
  (`Server/src/models/Cart.ts`, `Server/src/services/cartService.ts`).
  Nói cách khác: `main` hiện tại chưa có app mobile, chưa có endpoint
  mobile auth, chưa có API giỏ hàng.
- Nhánh local `feat/mobile-expo-phase1` ở `eeaf1f5` (Phase 1 + 1.1)
  **có** tất cả các thành phần cần thiết: `apps/mobile` đầy đủ,
  `POST /auth/login-mobile|refresh-mobile|logout-mobile`,
  `Server/src/models/Cart.ts`, `Server/src/services/cartService.ts`,
  `packages/contracts` (Cart/Quote) và `packages/api-client`
  (getCart/addCartItem/updateCartItem/removeCartItem/clearCart/quote).

Vì vậy, nhánh `feat/mobile-phase2a-cart` được tạo từ `eeaf1f5` rồi
**merge `origin/main` (`a4a440d`) vào trước** (commit merge `d78002d`),
thay vì tạo từ `main` trơ trọi — tạo từ `main` trơ trọi sẽ phải viết
lại toàn bộ app mobile và auth, tức là tự ý viết lại kiến trúc, điều
phase này cấm. Merge chỉ xung đột ở một file
`.github/workflows/ci.yml` (add/add); cách giải quyết: giữ workflow
local vì nó là siêu tập của workflow trên `main` (cùng job verify
`npm ci → lint → typecheck → test → build` trên Node 24, cộng thêm
`workflow_dispatch`, `concurrency`, `contents: read`, nhánh `fix/**`
và job audit report-only). Không bước nào của workflow trên `main`
bị mất. Các commit `d71a2ed`, `dc78350`, `a1c5cbc` của `main` đều có
mặt trong nhánh này.

Hệ quả cho PR: vì các nhánh local trước đây chưa từng được push,
PR của Phase 2A về `main` sẽ chứa cả công việc chưa push trước đó
(mobile Phase 1/1.1, backend giỏ/đơn, UI web, kiểm tra trình duyệt)
cộng với giỏ mobile Phase 2A. Đây là thực tế của lịch sử local, không
phải phạm vi mở rộng của Phase 2A; phần mô tả PR phải ghi rõ điều này
(xem mục 7).

## 2. Thiết kế giỏ hàng — vì sao dùng backend cart, không làm client-side

Kiểm tra code cho thấy backend **đã có API giỏ hàng riêng** trong nền
nhánh đã xác minh, nên điều kiện "chỉ dùng client-side khi backend
chưa có API" không xảy ra. Không tạo API backend mới:

- `GET /cart`, `POST /cart/items`, `PATCH /cart/items`,
  `DELETE /cart/items`, `DELETE /cart` — tất cả qua `requireAuth`
  (`Server/src/routes/checkout.routes.ts`).
- `POST /checkout/quote` — báo giá từ máy chủ, không giữ kho, không
  tiêu thụ coupon.
- Cart model chỉ lưu `{ user, items: [{ productId, sku, quantity }] }`,
  unique theo `user`. Không lưu giá, không lưu snapshot sản phẩm.
- `addToCart` gộp dòng cùng `(productId, sku)`; `updateCartItem`
  với `quantity = 0` xóa dòng; schema giới hạn quantity 1..999 cho
  add và 0..999 cho update. `resolveLines` kiểm tra sản phẩm tồn tại,
  còn bán (`isActive`) và biến thể tồn tại, trả về `unitPrice`
  (effectivePrice của máy chủ), `available = quantity - reserved`,
  `lineTotal`. Quote trả `canOrder = mọi dòng đều quantity <= available`.

Từ đó, mobile làm đúng theo mẫu của storefront `CartPage`:

- Màn hình giỏ: `GET /cart` → nếu trống thì trạng thái trống; nếu có
  dòng thì `POST /checkout/quote` → hiển thị tên, biến thể (màu/size),
  đơn giá, thành tiền dòng, tạm tính, phí vận chuyển, tổng — tất cả
  từ quote của máy chủ. **Không có tổng tiền nào được tính ở client
  để tạo đơn.** Khi đặt hàng (phase sau), hệ thống phải báo giá và
  kiểm tra tồn kho lại từ máy chủ; ghi chú này hiển thị ngay trên
  màn hình giỏ.
- Ảnh sản phẩm: quote không có ảnh, nên app gọi thêm
  `GET /products/:id` cho mỗi `productId` riêng biệt (song song,
  `Promise.allSettled`). Ảnh chỉ để hiển thị; ảnh lỗi không làm hỏng
  giỏ. Không thay đổi backend để thêm ảnh vào quote trong phase này.
- Biến thể: dòng giỏ được định danh bằng `(productId, sku)`. Cùng
  sản phẩm khác biến thể là dòng khác; cùng biến thể thêm nhiều lần
  thì cộng dồn (do máy chủ gộp).
- Số lượng: nút +/− trên màn hình giỏ, tối thiểu 1 (giảm từ 1 thành
  xóa dòng), tối đa là `available` của dòng đó và 999. Vượt `available`
  thì hiển thị cảnh báo đỏ và `canOrder = false`, không tự ý sửa số
  lượng của người dùng. Trên màn hình chi tiết, số lượng cũng bị kẹp
  theo `available`.
- Hết hàng / biến thể không còn hợp lệ:
  - Biến thể `available = 0`: nút "Thêm vào giỏ" bị vô hiệu, hiển thị
    "Hết hàng".
  - Quote thất bại vì `PRODUCT_NOT_FOUND`, `VARIANT_NOT_FOUND` hoặc
    `PRODUCT_INACTIVE` (một dòng đã ngừng bán / mất biến thể): màn
    hình giỏ vẫn hiển thị các dòng thô từ `GET /cart`
    (productId/sku/số lượng, không có giá) kèm nút xóa từng dòng và
    "Xóa toàn bộ", để người dùng tự khôi phục — tốt hơn storefront
    (chỉ có màn hình lỗi + thử lại) nhưng không phá mẫu chung.
  - Lỗi mạng / lỗi khác: màn hình lỗi + thử lại, không xóa phiên.
- Trạng thái: loading, empty, error và mất mạng đều có màn hình riêng,
  dùng chung `LoadingState`/`EmptyState`/`ErrorState` hiện có.

## 3. Tách giỏ hàng theo tài khoản và bảo mật

- **Máy chủ là lớp tách chính:** `Cart` unique theo `user`, mọi
  endpoint giỏ đều qua `requireAuth`, nên tài khoản A không bao giờ
  đọc/ghi được giỏ của tài khoản B ở phía server.
- **Client là lớp thứ hai:** `CartProvider` theo dõi `user.id` từ
  `AuthContext`; bất kỳ thay đổi nào của id — đăng nhập, đăng xuất,
  đổi tài khoản — đều reset toàn bộ trạng thái giỏ local rồi mới tải
  lại từ máy chủ cho tài khoản mới (helper thuần
  `shouldResetCart(prevUserId, nextUserId)`, có test).
- **Người dùng ẩn danh không có giỏ:** vì endpoint giỏ yêu cầu auth,
  Phase 2A không tạo giỏ local cho người ẩn danh (tránh rò rỉ khi đổi
  tài khoản và tránh bài toán gộp giỏ phức tạp). Người ẩn danh bấm
  "Thêm vào giỏ" hoặc mở màn hình giỏ sẽ thấy lời nhắc đăng nhập và
  được chuyển tới màn hình đăng nhập. Đây là quyết định có chủ ý của
  phase này; nếu muốn giỏ ẩn danh, cần phê duyệt riêng (thiết kế gộp
  giỏ khi đăng nhập + xóa giỏ ẩn danh khi đăng xuất).
- **Không lưu token trong dữ liệu giỏ:** giỏ chỉ chứa
  productId/sku/quantity; access/refresh token vẫn chỉ nằm trong
  SecureStore (Phase 1.1), không đi qua CartContext, không log.
- **Phiên hết hạn:** 401 sau khi api-client refresh thất bại sẽ gọi
  `handleSessionExpired()` (đã có từ Phase 1.1) và màn hình giỏ hiển
  thị lời nhắc đăng nhập lại, giống catalog. Lỗi 403/500/mạng không
  bị coi là hết hạn và không xóa phiên.
- **Không hồi quy auth:** không sửa `Server`, `packages/api-client`,
  `packages/contracts`, auth mobile, cookie auth của web, storefront
  hay admin. Mọi thay đổi đều nằm trong `apps/mobile` (cộng với báo
  cáo này).

## 4. File đã thay đổi và lý do

| File | Thay đổi |
|---|---|
| `apps/mobile/src/lib/cart.ts` (mới) | Helper thuần, test được: `cartKey`, `mergeCartItems`, `isValidQuantity`, `clampQuantity`, `parseCartItems`, `shouldResetCart`, `cartItemCount`. Ghi rõ quy tắc máy chủ mà helper phản chiếu, và khẳng định máy chủ mới có thẩm quyền về giá/tổng. |
| `apps/mobile/src/cart/CartContext.tsx` (mới) | `CartProvider`/`useCart`: tải giỏ + quote, ảnh catalog, trạng thái loading/mutating/error/notice/sessionExpired/quoteErrorCode, `addItem`/`updateQuantity`/`removeItem`/`clearCart`/`refresh`, reset giỏ khi đổi tài khoản, xử lý 401 và dòng không hợp lệ như mục 2–3. |
| `apps/mobile/src/app/cart.tsx` (mới) | Màn hình giỏ: nhắc đăng nhập, trống, lỗi, dòng không hợp lệ, danh sách dòng có ảnh/tên/biến thể/đơn giá/số lượng/thành tiền, +/−/xóa/xóa toàn bộ, tạm tính + phí + tổng từ quote, cảnh báo vượt tồn kho. |
| `apps/mobile/src/app/_layout.tsx` | Bọc `Stack` bằng `CartProvider` (bên trong `AuthProvider`) và thêm route `cart`. |
| `apps/mobile/src/app/index.tsx` | Nút "Giỏ hàng" ở đầu catalog, hiển thị số lượng (`(n)`) khi > 0. |
| `apps/mobile/src/app/product/[id].tsx` | Chọn số lượng (+/− kẹp theo `available`), nút "Thêm vào giỏ", **không tự chọn biến thể**: chỉ cho thêm khi người dùng đã chọn mọi chiều có lựa chọn (màu/size); chưa chọn thì nhắc chọn, hết hàng thì vô hiệu nút. Xóa dòng chữ "Giỏ hàng chưa có trong Phase 1". Lưu ý: `selectVariant()` của Phase 1 trả về biến thể đầu tiên khi chưa chọn gì — chỉ dùng cho hiển thị giá, không dùng cho việc thêm. |
| `apps/mobile/src/components/styles.ts` | Thêm `row`, `qtyRow`, `qtyButton`, `qtyButtonText`, `dangerText`, `thumb`; không sửa style cũ. |
| `apps/mobile/src/lib/cart.test.ts` (mới) | 10 test cho helper (xem mục 5). |
| `apps/mobile/src/lib/cartApi.test.ts` (mới) | 6 test ApiClient giỏ/quote với fetch mock (xem mục 5). |
| `apps/mobile/README.md` | Cập nhật: Phase 2A có giỏ hàng; vẫn chưa có checkout/đơn/AI. |
| `docs/MOBILE_PHASE_2A_CART_REPORT.md` (mới) | Báo cáo này. |

Không sửa: `Server/**`, `packages/**`, `apps/storefront/**`,
`apps/admin/**`, `.github/**` (ngoại trừ commit merge nền nhánh ở mục 1).

## 5. Kết quả kiểm thử

Môi trường: Node 24.22.1, npm 10.9.4, Expo SDK 58, không có
Java/Android SDK/adb/emulator trên máy này (như các phase trước).

| Lệnh | Kết quả |
|---|---|
| `npm run lint` (toàn repo) | PASS, không có lỗi |
| `npm run typecheck` (toàn repo) | PASS |
| `npm run test` — server | PASS, **91/91**, 0 skipped |
| `npm run test` — storefront | PASS, **4/4** |
| `npm run test` — admin | PASS, **2/2** |
| `npm run test` — mobile | PASS, **36/36** (trước Phase 2A là 20/20; thêm 16 test giỏ: `cart.test.ts` 10, `cartApi.test.ts` 6) |
| `npm run build` (toàn repo, gồm `expo export --platform android`) | PASS, bundle Android 2.6MB |
| `npx expo export --platform android` (riêng mobile) | PASS, bundle 2.6MB |
| `npm audit` | **BLOCKED** — proxy sandbox trả 403 như các phase trước; không kết luận dự án sạch lỗ hổng |

Test giỏ mới bao phủ đúng yêu cầu:
- Thêm cùng biến thể → cộng dồn (`mergeCartItems`).
- Cùng sản phẩm khác biến thể → dòng riêng.
- Cập nhật số lượng: hợp lệ 1..999, kẹp theo `available` và 999,
  0/âm/không nguyên/vượt 999 bị loại; giảm từ 1 ở màn hình giỏ
  thành xóa dòng (luồng này qua `updateQuantity` với quantity ≤ 0
  gọi remove).
- Xóa dòng, xóa toàn bộ (qua ApiClient `removeCartItem`/`clearCart`
  và context).
- Giỏ trống: `parseCartItems([])` và `cartItemCount([])` = 0; màn
  hình giỏ có trạng thái trống riêng.
- Dữ liệu không hợp lệ: `parseCartItems` loại productId/sku rỗng,
  quantity 0/âm/không nguyên/>999, null, chuỗi; đếm `invalidCount`.
- Lỗi tải dữ liệu: màn hình giỏ có ErrorState + thử lại; lỗi mạng
  không xóa phiên (luồng này dùng chung `apiErrorMessage` và xử lý
  401 riêng đã có từ Phase 1.1).
- Tách theo tài khoản: `shouldResetCart` — reset khi đăng nhập,
  đăng xuất, đổi tài khoản; không reset khi cùng tài khoản.
- Không hồi quy: toàn bộ test cũ vẫn pass (server 91, storefront 4,
  admin 2, mobile cũ 20).

Kiểm chứng API thật trên backend test tách biệt (không phải dữ liệu
thật, không phải production; replica set cổng 27018, backend 8081,
DB test riêng; giỏ để trống sau kiểm chứng):
- `login-mobile` OK (tài khoản test demo).
- `POST /cart/items` x2 rồi +1 cùng biến thể → giỏ gộp thành
  quantity 3 (đúng quy tắc cộng dồn của máy chủ).
- `POST /checkout/quote` với quantity 3 → đơn giá 379.000đ, tạm tính
  1.137.000đ, `canOrder = true`.
- `PATCH /cart/items` về 1, rồi `DELETE /cart/items` → giỏ rỗng.
- `GET /cart` không token → `TOKEN_MISSING`.
- Thêm biến thể không tồn tại → `VARIANT_NOT_FOUND`.

## 6. Giới hạn chưa xác minh

- **Chưa kiểm thử trên thiết bị thật hoặc emulator** (môi trường này
  không có Java/Android SDK/adb/emulator). Màn hình giỏ và nút thêm
  vào giỏ mới chỉ được kiểm chứng ở mức typecheck, test, build/export
  và API thật qua curl. Không tuyên bố đã kiểm thử thiết bị thành công.
- **Chưa kiểm thử render màn hình giỏ** (React Native Testing Library
  chưa được thêm vào repo; thêm dependency render test cần phê duyệt
  riêng theo quy tắc "không thêm dependency nếu chưa có lý do rõ ràng").
  Hành vi màn hình giỏ được bảo đảm gián tiếp qua test helper +
  test ApiClient + kiểm chứng API thật.
- **Chưa có checkout/đơn hàng trên mobile.** Màn hình giỏ chỉ hiển
  thị tổng từ quote; chưa có nút đặt hàng. Phase sau phải dùng
  quote mới nhất + `POST /orders` với `Idempotency-Key` và kiểm tra
  tồn kho phía server, không dùng tổng đã hiển thị để tạo đơn.
- **Chưa có giỏ ẩn danh** (xem mục 3) và chưa có đồng bộ giỏ giữa
  web và mobile ngoài việc cùng dùng một Cart phía server theo tài
  khoản (cùng tài khoản thì web và mobile thấy cùng một giỏ — đây là
  hệ quả của thiết kế server, chưa kiểm thử tay trên cả hai app).
- **Ảnh trong giỏ** phụ thuộc `GET /products/:id` thêm cho mỗi sản
  phẩm; giỏ rất lớn (tối đa 50 dòng theo schema quote) sẽ tạo nhiều
  request. Chưa đo hiệu năng; nếu cần, phase sau có thể cân nhắc
  thêm ảnh vào quote ở backend (cần phê duyệt và test riêng).
- **PR GitHub chưa tạo được từ máy này** (xem mục 7).

## 7. PR — trạng thái và cách tạo

- Nhánh: `feat/mobile-phase2a-cart`, commit nền merge `d78002d`
  (chứa `origin/main` `a4a440d` + `eeaf1f5`), cộng các commit Phase 2A
  chưa push. **Chưa merge.**
- **Tạo PR bị BLOCKED từ máy này:** `gh auth status` báo "You are
  not logged into any GitHub hosts" và máy này chưa từng đăng nhập
  GitHub (cùng nguyên nhân đã chặn push ở các phase trước). Không
  yêu cầu chủ repo gửi token/mật khẩu trong chat. Không tuyên bố đã
  mở PR khi chưa có URL PR thật.
- Để tạo PR, chủ repo chỉ cần (trên máy của mình, không cần mở
  VS Code hay tải code về nếu dùng GitHub web + terminal có sẵn):
  1. Lấy patch/nhánh từ máy này (file patch sẽ gửi kèm cùng báo cáo
     này khi chủ repo xác nhận cách nhận), push nhánh
     `feat/mobile-phase2a-cart` lên `origin`.
  2. Mở PR từ nhánh đó về `main` với tiêu đề gợi ý:
     "Mobile Phase 2A: giỏ hàng (backend cart + quote có sẵn)".
  3. Mô tả PR phải ghi rõ hai điểm: (a) PR này chứa cả công việc
     local chưa push trước đó (mobile Phase 1/1.1, backend giỏ/đơn,
     UI web, kiểm tra trình duyệt) vì các nhánh đó chưa từng được
     push — phần mới của riêng Phase 2A là các file ở mục 4;
     (b) kết quả kiểm thử ở mục 5, và các giới hạn ở mục 6, đặc
     biệt là chưa kiểm thử trên thiết bị thật/emulator.
- Patch đã tạo kèm báo cáo này (giữ ngoài repo, không commit patch
  vào repo): patch riêng Phase 2A so với commit merge nền `d78002d`
  là `cutishop-pr-mobile-phase2a-cart.patch`; patch tổng từ `main`
  (`a4a440d`) tới HEAD hiện tại là
  `cutishop-pr-mobile-phase2a-cart-full.patch`. Dùng một trong hai
  để khôi phục nhánh nếu PR chưa tạo ngay được; không áp cả hai
  chồng lên nhau.

## 8. Hướng dẫn kiểm thử thủ công (khi chủ repo tải dự án về máy)

Dùng lại hướng dẫn chạy ở `apps/mobile/README.md` và checklist
Android đã có (backend cổng 8081, Expo cổng khác 8082, emulator
dùng `http://10.0.2.2:8081/api/v1`, điện thoại thật dùng IP LAN).
Tài khoản test tự tạo trên DB local của chủ repo; không dùng tài
khoản thật.

1. Đăng nhập trên mobile, mở catalog, vào chi tiết một sản phẩm có
   nhiều biến thể. Chưa chọn màu/size → nút "Thêm vào giỏ" phải bị
   vô hiệu và có nhắc chọn. Chọn màu/size → nút bật, số lượng mặc
   định 1.
2. Tăng số lượng vượt `available` hiển thị → nút + phải dừng ở
   `available`. Chọn biến thể hết hàng → nút bị vô hiệu, hiển thị
   "Hết hàng".
3. Bấm "Thêm vào giỏ" → thấy "Đã thêm vào giỏ hàng" và nút
   "Xem giỏ hàng →". Thêm cùng biến thể lần nữa → vào giỏ, số lượng
   dòng đó tăng (không tạo dòng mới). Thêm biến thể khác của cùng
   sản phẩm → dòng mới riêng.
4. Màn hình giỏ: kiểm tra ảnh, tên, biến thể, đơn giá, thành tiền
   dòng, tạm tính khớp với web storefront cùng tài khoản (cùng một
   Cart phía server). Tăng/giảm số lượng, giảm từ 1 → dòng biến mất.
   Xóa từng dòng, rồi "Xóa toàn bộ" → trạng thái giỏ trống.
5. Đăng xuất rồi đăng nhập tài khoản khác → giỏ của tài khoản cũ
   không được hiện; đăng nhập lại tài khoản cũ → giỏ cũ quay lại
   (từ máy chủ).
6. Không đăng nhập → mở giỏ phải thấy nhắc đăng nhập; bấm "Thêm vào
   giỏ" ở chi tiết → được chuyển tới màn hình đăng nhập.
7. Tắt backend rồi mở giỏ → màn hình lỗi mạng + thử lại; bật lại
   backend, bấm thử lại → giỏ tải lại, không bị đăng xuất.
8. Trên web admin, vô hiệu hóa một sản phẩm đang có trong giỏ mobile
   (hoặc xóa biến thể đó), rồi mở giỏ mobile → phải thấy thông báo
   dòng không còn hợp lệ kèm nút xóa dòng đó; xóa xong, tải lại →
   giỏ hiển thị giá/tổng bình thường.
9. Kiểm tra số lượng vượt tồn kho: trên web/admin giảm tồn kho của
   một biến thể xuống dưới số lượng trong giỏ mobile, mở giỏ mobile
   → phải thấy cảnh báo đỏ "vượt tồn kho" và không có nút đặt hàng
   trong phase này (chưa có checkout).
