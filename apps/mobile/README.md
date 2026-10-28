# CutiShop Mobile — Expo Phase 1 và 1.1

Ứng dụng React Native + Expo (SDK 58) cho CutiShop, dùng chung backend
`/api/v1` và dữ liệu thật với website. Phase 1 chỉ gồm: đăng nhập/đăng
xuất, danh mục sản phẩm, tìm kiếm, chi tiết sản phẩm và chọn biến thể.
Phase 1.1 hoàn thiện xác thực mobile (refresh riêng, xem dưới). Chưa có
giỏ hàng, checkout, đơn hàng hay AI trong các phase này.

## Chạy

```bash
# Từ thư mục gốc của repo, backend phải chạy trước (cổng 8081, replica set
# chỉ cần cho đơn hàng; catalog và đăng nhập không cần transaction)
npm run dev:server

# Từ apps/mobile
npm start          # mở Metro, quét QR bằng Expo Go, hoặc
npm run android    # cần Android Studio / emulator
```

## Cấu hình API

- Biến môi trường (inlined lúc bundle, không phải secret):
  `EXPO_PUBLIC_API_BASE_URL`
- Mặc định: `http://10.0.2.2:8081/api/v1` — alias của Android emulator
  trỏ về loopback của máy host.
- Thiết bị thật (Expo Go): `10.0.2.2` không hoạt động. Chạy với
  `EXPO_PUBLIC_API_BASE_URL=http://<IP LAN của máy chạy backend>:8081/api/v1`
- Web local: `http://127.0.0.1:8081/api/v1`.
- Màn hình đăng nhập và danh mục hiển thị API base URL đang dùng để dễ
  chẩn đoán khi không kết nối được.

## Session trên mobile — Phase 1.1 (phương án C, đã duyệt)

Web dùng refresh token **chỉ qua cookie HttpOnly**
(`cutishop1_refresh`, path `/api/v1/auth`). JavaScript không đọc được
cookie HttpOnly, và fetch của React Native không đảm bảo giữ cookie qua
các lần mở app, nên mobile **không dùng luồng cookie**.

Mobile dùng 3 endpoint riêng, tái dùng đúng `authService` của web
(rotation, kiểm tra hash, phát hiện reuse và thu hồi theo session):
`POST /auth/login-mobile`, `/auth/refresh-mobile`,
`/auth/logout-mobile`. Refresh token đi trong body, **không set cookie**
cho mobile. Access token TTL 15 phút, refresh token TTL 7 ngày, không đổi.

- Access token và refresh token chỉ lưu trong `expo-secure-store`
  (Android: SharedPreferences mã hóa bằng Keystore; iOS: Keychain).
  Không dùng AsyncStorage, file thường, không log token, không đưa
  secrets vào bundle.
- Mở app: token đã lưu được nạp vào bộ nhớ và kiểm chứng bằng
  `/auth/me`. Nếu chỉ còn refresh token, app thử refresh một lần rồi
  mới gọi `/me`. Hết phiên không khôi phục được thì xóa cả hai token
  và yêu cầu đăng nhập lại. Lỗi mạng, 403, 500 không xóa phiên.
- Hết phiên giữa chừng: api-client refresh một lần duy nhất
  (single-flight cho nhiều request cùng 401), lưu cặp token đã xoay
  vòng, rồi retry request gốc tối đa một lần. Refresh thất bại do hết
  hạn/thu hồi/reuse thì xóa cả hai token và đăng xuất.
- Đăng xuất: gọi `/auth/logout-mobile` (chỉ thu hồi đúng session đó)
  và **luôn** xóa token local + chuyển UI về anonymous, kể cả khi
  API logout thất bại (mất mạng, 500). Giới hạn: đăng xuất offline
  không thể thu hồi session trên server cho tới khi có mạng; session
  đó vẫn còn hiệu lực tới khi hết hạn hoặc bị thu hồi sau.
- Refresh-mobile giữ nguyên tư thế rate limit như refresh web trong
  phase này (không có limiter riêng) — quyết định đã cân nhắc rủi ro,
  không khẳng định endpoint refresh đã có rate limit riêng.
- Web không đổi: vẫn dùng cookie HttpOnly, api-client mặc định vẫn là
  chế độ cookie; chỉ mobile truyền `authMode: 'mobile'`.

## Kiểm thử

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest, chỉ các module logic thuần (src/lib)
npm run build       # expo export --platform android (bundle Metro, không cần thiết bị)
npm run lint        # chạy từ thư mục gốc: npm run lint
```

Kiểm thử trên emulator/thiết bị thật chưa được xác minh trong môi trường
này nếu không có Android emulator (xem báo cáo Phase 1).
