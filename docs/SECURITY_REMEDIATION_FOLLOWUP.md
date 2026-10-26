# BÁO CÁO SECURITY REMEDIATION — ROUND 2 / FOLLOWUP (npm audit)

- Repository: https://github.com/AnhLong2k4/CUTISHOP1
- Nhánh round 2: `fix/phase1-security-audit-followup`, tách từ
  `fix/phase1-security-audit @ b226b1be` (round 1). PR round 2 mở vào base
  `fix/phase1-security-audit` để diff chỉ chứa phần sửa round 2.
  KHÔNG merge PR nào, KHÔNG deploy, KHÔNG chạm `main`, KHÔNG gửi email thật.
- Ngày thực hiện: 2026-10-26. Môi trường kiểm chứng: sandbox Linux của
  Muse, Node v24.22.1; mọi thao tác npm dùng **npm 11.12.1** (đúng phiên
  bản trên máy Windows của chủ repo) qua `npx npm@11.12.1`.

## 1. Vì sao có round 2 (bằng chứng mới từ Windows)

Chủ repo đã kiểm chứng round 1 trên Windows (Node v24.15.0, npm 11.12.1):
checkout đúng nhánh `fix/phase1-security-audit @ b226b1b`, `npm ci` thành
công, nhưng `npm audit` vẫn còn **2 High vulnerabilities**:

1. **nodemailer** — advisory range `<=10.1.3`; bản 7.0.13 của round 1 vẫn
   nằm trong range. npm đề xuất `nodemailer@10.2.1` (breaking).
2. **zod** — advisory range `<4.6.6`; bản 3.25.76 được giữ ở round 1 nằm
   trong range. npm đề xuất `zod@4.6.7` (breaking).

Bằng chứng này **thay thế** hai kết luận của round 1 ("zod 3.25.76 là bản
vá npm đề xuất" và "nodemailer 7.0.13 đã vá xong"): tại thời điểm round 1,
audit endpoint trong sandbox bị chặn nên kết luận dựa trên dữ liệu audit
baseline cũ; dữ liệu audit mới trên Windows cho thấy cả hai package vẫn bị
gắn cờ. Round 2 xử lý dứt điểm cả hai theo đúng bản vá mới nhất.

## 2. Advisory đã xử lý

| Package | Loại | Range bị ảnh hưởng (theo audit Windows) | Bản vá đầu tiên | Phiên bản đã chọn | Kiểm chứng phiên bản |
|---|---|---|---|---|---|
| nodemailer | production, trực tiếp (Server) | `<=10.1.3` (gồm cả 7.0.13 của round 1) | 10.1.4 (changelog 10.1.4, 2026-10-18: vá `addressparser` — giới hạn độ lồng group, quy tắc `<` ngoài quotes/comments) | **10.2.1** | `npm view nodemailer version` = 10.2.1 (dist-tag `latest`), engines `node >=20` — khớp engines của project (`>=20`) và Node 24 trên cả sandbox lẫn Windows; cũng đúng bản npm đề xuất trên Windows |
| zod | production, trực tiếp (Server) | `<4.6.6` (gồm cả 3.25.76) | 4.6.6 | **4.6.7** | `npm view zod version` = 4.6.7 (dist-tag `latest`, bản ổn định mới nhất của dòng 4); đúng bản npm đề xuất trên Windows |

Ghi chú minh bạch: mã GHSA cụ thể của hai advisory **không có trong bằng
chứng audit được cung cấp** (output Windows chỉ gồm range + bản đề xuất) và
audit endpoint trong sandbox bị chặn (mục 6), nên báo cáo này ghi range +
bản vá đã kiểm chứng thay vì ghi mã GHSA suy đoán.

## 3. Thay đổi phiên bản (trước → sau)

| Package | Trước (round 1) | Sau (round 2) | Lý do |
|---|---|---|---|
| nodemailer | 7.0.13 (`^7.0.13`) | **10.2.1** (`^10.2.1`) | Ngoài range `<=10.1.3`; bản ổn định mới nhất tại thời điểm sửa |
| @types/nodemailer | 7.0.12 (`^7.0.12`) | **ĐÃ GỠ BỎ** | nodemailer 10 đã bundle sẵn type declarations (gói cài đặt chứa `dist/cjs/nodemailer.d.ts` và các `.d.ts` đi kèm; changelog 10.0.0: "migrate to TypeScript with ES module and CommonJS builds" + "keep the @types/nodemailer type layout working"). Giữ `@types/nodemailer@7` (types cho API v7) cạnh types gốc của v10 là thừa và có nguy cơ lệch API. Sau khi gỡ, `npm ls` không còn `@types/nodemailer` và typecheck PASS (mục 6) |
| zod | 3.25.76 (manifest `^3.24.1`) | **4.6.7** (`^4.6.7`) | Ngoài range `<4.6.6`; migration đầy đủ ở mục 5 |

Lockfile được cập nhật hoàn toàn bằng npm (`install`/`uninstall`), không
sửa tay integrity hash. Không chạy `npm audit fix --force`.

### Nodemailer 7 → 10: rà soát breaking changes (từ CHANGELOG chính thức trong gói)

- **8.0.0**: error code `'NoAuth'` đổi tên thành `'ENOAUTH'` — code của
  project không kiểm tra error code của nodemailer (chỉ `await sendMail`)
  → không ảnh hưởng.
- **9.0.0**: các HTTPS request khi fetch nội dung từ xa (attachment theo
  URL, OAuth2 endpoint, proxy CONNECT) mặc định kiểm tra TLS certificate —
  project chỉ gửi email text thuần, không fetch nội dung từ xa → không
  ảnh hưởng.
- **10.0.0**: yêu cầu Node >= 20 (project đã `>=20`) và chuyển sang
  TypeScript build với types bundle sẵn (xem bảng trên).
- API project đang dùng — `createTransport({ host, port, secure, auth })`
  và `sendMail({ from, to, subject, text })` — **không thay đổi** qua cả
  ba major; file `Server/src/services/mailer.ts` **không cần sửa dòng nào**.

## 4. Phạm vi sử dụng (đã grep lại toàn bộ repo ở round 2)

- `nodemailer`: chỉ `Server/src/services/mailer.ts` (+ khai báo trong
  `Server/package.json`).
- `zod`: chỉ 4 file — `Server/src/config/env.ts`,
  `Server/src/routes/schemas.ts`, `Server/src/middleware/validate.ts`,
  `Server/src/middleware/errorHandler.ts`. Không workspace nào khác
  (kể cả `packages/contracts`, storefront, admin) import zod.

## 5. Zod 4 migration — chi tiết từng điểm chạm

Đã đối chiếu migration guide chính thức của Zod 4 và kiểm chứng thực
nghiệm bằng script chạy trên chính zod 4.6.7 đã cài (kết quả ghi ở từng
mục). Chỉ sửa 3 file source; **không sửa file test nào, không bỏ/bớt
assertion nào**.

### 5.1 `Server/src/middleware/validate.ts` — BẮT BUỘC sửa (API bị loại bỏ)

- Zod 4 không còn export `ZodTypeDef`; `ZodType` chỉ còn 2 generic
  (`ZodType<Output, Input>` thay cho `ZodType<Output, Def, Input>`).
- Sửa: `ZodType<T, ZodTypeDef, unknown>` → `ZodType<T, unknown>` ở cả
  `validateBody` và `validateQuery`. Các controller vẫn cast
  `req.validatedBody` như cũ — hành vi runtime không đổi, typecheck PASS.

### 5.2 `Server/src/routes/schemas.ts` — string formats chuyển sang top-level API

- **email**: `z.string().trim().email(msg).max(160)` →
  `z.string().trim().pipe(z.email(msg).max(160))`.
  Lý do dùng `pipe`: kiểm chứng thực nghiệm cho thấy `z.email()` đơn lẻ
  **từ chối** email có khoảng trắng hai đầu (format check chạy trước mọi
  bước xử lý), trong khi bản v3 cắt khoảng trắng trước rồi mới kiểm tra.
  Dạng `pipe` giữ nguyên đúng thứ tự trim → email → max(160) và thông báo
  lỗi tiếng Việt như cũ.
- **datetime**: `z.string().datetime()` → `z.iso.datetime()` (2 field
  `saleStartsAt`, `saleEndsAt`). Đã kiểm chứng thực nghiệm: cả hai cùng
  mặc định **không** chấp nhận offset `+07:00` và chấp nhận hậu tố `Z` —
  hành vi không đổi.
- **url (images)**: `z.array(z.string().url())` → `z.array(z.url())`.

### 5.3 `Server/src/config/env.ts` — url chuyển sang top-level API

- `APP_URL`: `z.string().url()` → `z.url()` (vẫn `.default(...)` như cũ).

### 5.4 Đã kiểm chứng KHÔNG cần sửa (khác biệt v3 → v4 không chạm tới)

- `errorHandler.ts` và `env.ts` đã dùng `error.issues` từ trước; alias
  `.errors` bị loại ở v4 không được dùng ở đâu. `instanceof ZodError`
  vẫn đúng với lỗi do zod 4 ném ra (kiểm chứng thực nghiệm + toàn bộ
  test integration đi qua error handler).
- Định dạng lỗi trả về client **không đổi**: vẫn
  `{ success: false, error: { code: 'VALIDATION_ERROR', message, details: [{ path, message }] } }`
  với `path` từ `issue.path.join('.')` — test integration khẳng định
  status 400 + `error.code` đều PASS.
- Truyền message dạng string (`.min(8, '...')`, `.int('...')`,
  `.email('...')`) vẫn được zod 4 chấp nhận — kiểm chứng thực nghiệm.
- `.refine(data => ..., { message, path })` vẫn giữ nguyên semantics
  (issue có `path: ['salePrice']` như v3) — kiểm chứng thực nghiệm.
- `z.coerce.number()` + `.default(...)`: zod 4 có thay đổi semantics của
  `.default()` (giá trị default nay được parse qua schema); mọi default
  trong `env.ts` đều là giá trị hợp lệ nên kết quả parse không đổi —
  kiểm chứng thực nghiệm và qua kiểm tra fail-fast ở mục 6.
- `z.enum([...]).transform(...)`, `.partial()`, `z.infer` — không thay
  đổi hành vi đối với cách dùng hiện tại; typecheck + test PASS.

## 6. Kiểm thử đã chạy (sandbox, Node v24.22.1, npm 11.12.1)

| Lệnh / kiểm tra | Kết quả | Bằng chứng |
|---|---|---|
| `npm ci` | **PASS** | Cài sạch 461 packages từ lockfile mới, exit 0 |
| `npm ls nodemailer zod @types/nodemailer` | **PASS** | `nodemailer@10.2.1`, `zod@4.6.7`, `@types/nodemailer` không còn |
| `npm run lint` | **PASS** | exit 0, 0 lỗi |
| `npm run typecheck` | **PASS** | server + storefront + admin, exit 0 — chứng minh types bundle của nodemailer 10 và typings zod 4 biên dịch sạch với toàn bộ source đã migrate |
| `npm test` (lần 1) | **PASS về test, FAIL về exit code — artifact cũ** | 44/44 test thật PASS, nhưng vitest còn nhặt 4 bản sao test đã biên dịch trong `Server/dist/test/*.test.js` (artifact còn lại từ lần build của round 1; `dist` là thư mục build, không nằm trong repo) và 4 suite copy đó fail vì vitest không chạy trong file CommonJS. Đây là artifact môi trường có từ trước round 2 — đúng hiện tượng đã ghi trong báo cáo round 1 |
| `npm test` (lần 2, sau khi xóa `Server/dist` cũ) | **PASS** | Server **44/44**, storefront **2/2**, admin **1/1**, exit 0 |
| `npm run build` (chạy lại sau test) | **PASS** | contracts + server (tsc) + storefront + admin (vite), exit 0 |
| `npm audit` (baseline round 2 và sau sửa) | **BLOCKED** | Cả hai lần thử đều bị proxy của sandbox trả `403 policy_denied` cho endpoint `/-/npm/v1/security/advisories/bulk` (giống round 1). Đây là giới hạn môi trường sandbox, không phải lỗi code — xem mục 7 |
| Runtime API thật (MongoDB 8.0.4 replica set, DB test mới `cutishop1_runtime_test_r2`, backend build từ code round 2) | **PASS 34/34** | Gồm: health + DB connected; register 201 + cookie httpOnly; trùng email 409; mật khẩu ngắn 400 `VALIDATION_ERROR`; sai mật khẩu 401; refresh rotate + **dùng lại token cũ → 401 SESSION_REVOKED**; RBAC anonymous 401 / customer 403 / admin 201; catalog CRUD, SKU + giá biến thể, phân trang/tìm kiếm/lọc/sort, sort không hợp lệ 400; forgot-password 200 generic; **reset qua ConsoleMailer (dev) → login bằng mật khẩu mới 200; dùng lại reset token → 400 `RESET_TOKEN_INVALID`**; upload chưa cấu hình → 503 |
| Mailer adapter 3 chế độ (chạy trực tiếp trên bản build) | **PASS** | production + chưa cấu hình SMTP → `UnconfiguredMailer`, ném `503 EMAIL_NOT_CONFIGURED`; development → `ConsoleMailer` in link ra log, không gửi email; production + có cấu hình SMTP → `SmtpMailer` |
| SmtpMailer với host SMTP không tồn tại | **PASS (đúng kỳ vọng)** | `createTransport` + `sendMail` thực thi được dưới nodemailer 10.2.1 và chỉ fail ở bước kết nối mạng (host `.invalid`) — chứng minh API tương thích; **không có email nào được gửi** |
| Env fail-fast dưới zod 4 | **PASS** | Thiếu `MONGO_URI`/JWT secrets → backend từ chối khởi động, in tên biến lỗi (không in giá trị) |

Phạm vi test bao phủ đúng các luồng được yêu cầu: login, refresh
rotation + reuse revocation, logout (trong auth integration tests),
forgot/reset + reset-token reuse, RBAC 401/403, catalog
CRUD/validation/giá biến thể/phân trang/lọc/sort, validation errors.

## 7. Trạng thái audit cuối cùng và giới hạn

- **Không tuyên bố "audit sạch"**: `npm audit` sau sửa **BLOCKED** trong
  sandbox (403 `policy_denied`, đã thử ở cả baseline và sau sửa), nên chưa
  có output audit thành công cho trạng thái round 2 từ phía Muse.
- Điều đã xác minh được bằng chứng khác: cả hai package đã cài nằm
  **ngoài range bị ảnh hưởng** theo chính dữ liệu audit Windows của chủ
  repo — nodemailer `10.2.1` > `<=10.1.3`; zod `4.6.7` >= bản vá `4.6.6`
  (đồng thời là bản `latest` tại thời điểm sửa).
- Bước xác minh cuối cùng thuộc về Windows (mục 8): chạy `npm audit` trên
  nhánh này. Kỳ vọng hai advisory High biến mất. Nếu audit còn gắn cờ
  package nào khác (ví dụ nhóm esbuild/vite dev-only đã phân tích ở
  round 1 — round 2 không thay đổi gì ở nhóm đó), gửi lại output để xử
  lý tiếp; không tự kết luận trước khi có output thật.
- Giới hạn khác: không gửi email SMTP thật (chỉ kiểm chứng adapter +
  bước tạo transport); responsive/browser E2E vẫn ngoài phạm vi như
  Phase 1.

## 8. Hướng dẫn chạy lại trên Windows

Trong thư mục checkout của CUTISHOP1 (Node v24.15.0, npm 11.12.1):

```bat
git fetch origin
git checkout fix/phase1-security-audit-followup
npm ci
npm audit
npm run lint
npm run typecheck
npm test
npm run build
```

Lưu ý: chạy `npm test` **trước** `npm run build`. Nếu `npm test` báo fail
ở các file trong `Server\dist\test` thì đó là artifact của lần build
trước (giống hệt hiện tượng đã gặp trong sandbox): xóa thư mục
`Server\dist` rồi chạy lại `npm test`.

Chỉ cần gửi lại kết quả `npm audit` là đủ để chốt trạng thái audit của
round 2.

## 9. File đã thay đổi (round 2)

**Dependencies:**
- `Server/package.json` — nodemailer `^7.0.13` → `^10.2.1`; zod
  `^3.24.1` → `^4.6.7`; gỡ `@types/nodemailer`.
- `package-lock.json` — npm cập nhật (không sửa tay).

**Source (chỉ phục vụ migration zod 4, mục 5):**
- `Server/src/middleware/validate.ts` — bỏ `ZodTypeDef`, generic 2 tham số.
- `Server/src/routes/schemas.ts` — email qua `z.email()` dạng pipe;
  `z.iso.datetime()`; `z.url()` cho images.
- `Server/src/config/env.ts` — `z.url()` cho `APP_URL`.

**Không thay đổi:** mọi file test; `Server/src/services/mailer.ts`;
toàn bộ source còn lại.

**Tài liệu:** `docs/SECURITY_REMEDIATION_FOLLOWUP.md` (file này).
