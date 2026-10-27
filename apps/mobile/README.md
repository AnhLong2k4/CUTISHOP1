# CutiShop Mobile — Expo Phase 1

Ứng dụng React Native + Expo (SDK 58) cho CutiShop, dùng chung backend
`/api/v1` và dữ liệu thật với website. Phase 1 chỉ gồm: đăng nhập/đăng
xuất, danh mục sản phẩm, tìm kiếm, chi tiết sản phẩm và chọn biến thể.
Chưa có giỏ hàng, checkout, đơn hàng hay AI trong Phase 1.

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

## Session trên mobile — quyết định Phase 1

Backend cấp refresh token **chỉ qua cookie HttpOnly**
(`cutishop1_refresh`, path `/api/v1/auth`) và endpoint refresh chỉ đọc
cookie, không nhận token qua body/header. JavaScript không đọc được
cookie HttpOnly, và fetch của React Native không đảm bảo giữ cookie qua
các lần mở app, nên Phase 1 **không dựa vào cookie refresh**.

- Chỉ access token (15 phút) được lưu, và chỉ trong `expo-secure-store`
  (Android: SharedPreferences mã hóa bằng Keystore; iOS: Keychain).
  Không dùng AsyncStorage, file thường hay state lưu lâu cho token.
- Mở app: token đã lưu được nạp vào bộ nhớ và kiểm chứng bằng
  `/auth/me`. Token hết hạn/không hợp lệ bị xóa và app yêu cầu đăng
  nhập lại.
- Hết phiên giữa chừng (401 sau khi thử refresh bằng cookie thất bại):
  app xóa token đã lưu và đưa người dùng về đăng nhập.
- Đăng xuất: gọi `/auth/logout` best-effort (thu hồi session cookie nếu
  native stack có gửi) và luôn xóa token local.

Làm mới phiên âm thầm trên mobile là việc của Phase sau và cần một
quyết định bảo mật riêng (ví dụ endpoint refresh cho mobile), không
được lén lút lưu refresh token vào SecureStore trong Phase 1 khi backend
không cấp nó qua kênh đó.

## Kiểm thử

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest, chỉ các module logic thuần (src/lib)
npm run build       # expo export --platform android (bundle Metro, không cần thiết bị)
npm run lint        # chạy từ thư mục gốc: npm run lint
```

Kiểm thử trên emulator/thiết bị thật chưa được xác minh trong môi trường
này nếu không có Android emulator (xem báo cáo Phase 1).
