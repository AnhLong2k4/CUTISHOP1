# BÁO CÁO SECURITY REMEDIATION — PHASE 1 (npm audit)

- Repository: https://github.com/AnhLong2k4/CUTISHOP1
- Nhánh remediation: `fix/phase1-security-audit`, tách từ
  `feat/phase1-foundation-auth-catalog @ e982149e` (PR #1, đang chờ review).
- PR remediation mở vào base `feat/phase1-foundation-auth-catalog` để diff
  chỉ chứa phần sửa security. KHÔNG merge PR nào, KHÔNG deploy, KHÔNG
  chạm dữ liệu production, KHÔNG sửa `main`.
- Ngày thực hiện: 2026-10-25. Môi trường kiểm chứng: sandbox Linux của
  Muse, Node v24.22.1; mọi thao tác npm dùng **npm 11.12.1** (đúng phiên
  bản trên máy Windows của chủ repo) qua `npx npm@11.12.1` — lý do ở mục 6.

> **Trạng thái hiện tại (cập nhật 2026-10-26):** báo cáo này là
> bằng chứng lịch sử của vòng 1 (2026-10-25) — số liệu trong thân
> báo cáo không thay đổi. Hai kết luận của vòng 1 (giữ zod
> 3.25.76; nodemailer 7.0.13 coi như đã vá) **đã bị vòng 2 thay
> thế**: audit trên Windows sau đó cho thấy vẫn còn 2 advisory
> High, và vòng 2 đã nâng nodemailer lên 10.2.1, migrate zod lên
> 4.6.7 — xem `docs/SECURITY_REMEDIATION_FOLLOWUP.md`. Cả hai
> vòng đã vào `main` qua PR #2 (commit merge
> `3f654bcc05c2ab5dd603923af87a18d03c5da7c0`, 2026-10-26); PR #1
> chứa vòng 1 tại thời điểm cập nhật vẫn OPEN nhưng nội dung đã
> bị thay thế (mọi commit đã có trong `main` qua PR #2).

## 1. Baseline audit (trước sửa)

Kết quả thực tế ghi lại từ lần chạy `npm audit` thành công duy nhất trong
sandbox (ngay đầu phiên làm việc) và đối chiếu với log `npm audit` của
người dùng trên Windows (Node v24.15.0, npm 11.12.1):

- Tổng: **5 vulnerabilities (1 low, 3 moderate, 1 high)**.
- Phiên bản cài đặt tại thời điểm đó (lockfile, `npm ls`):
  `vitest 3.2.7`, `@vitest/mocker 3.2.7`, `tinypool 1.1.1`,
  `nodemailer 6.10.1`, `zod 3.25.76`.

| # | Package | Severity | Loại | Đường dependency | Vấn đề |
|---|---------|----------|------|------------------|--------|
| 1 | nodemailer | **high** | production, trực tiếp (Server) | `@cutishop1/server → nodemailer@6.10.1` | Nhiều advisory gộp: gửi email tới domain ngoài ý muốn qua addressparser; SMTP command injection qua CRLF; SMTP injection qua EHLO; DoS qua đệ quy / địa chỉ quá lớn (range bị ảnh hưởng `<=7.0.10`); attacker điều khiển socket làm tắt kiểm tra TLS / lộ metadata cloud; bypass kiểm tra TLS trong `verify()`; đọc file / SSRF trong transport. npm đề xuất bản vá **7.0.13** |
| 2 | vitest / @vitest/mocker / tinypool | low–moderate | dev only (test/build) | `{Server, apps/storefront, apps/admin} → vitest@3.2.7 → @vitest/mocker@3.2.7, tinypool@1.1.1` | Nhóm advisory trên Vitest 3.2.7 và hai dependency đi kèm mà người dùng thấy trên Windows. Chỉ tồn tại trong môi trường test/build, không có trong runtime production |
| 3 | zod | moderate | production, trực tiếp (Server) | `@cutishop1/server → zod@3.25.76` | npm audit **tự đề xuất bản vá là 3.25.76** (`fixAvailable: 3.25.76`, không phải major) — trùng đúng phiên bản đã cài và là bản ổn định mới nhất của dòng 3.x. Xem quyết định ở mục 3 |
| 4 | esbuild (qua vite) | moderate | dev only | `apps/* → vite@6.4.5 → esbuild@0.25.12`; root `esbuild@0.28.2` | GHSA-67mh-4wv8-2f99: website bất kỳ gửi được request tới dev server; range bị ảnh hưởng `<=0.24.2`. Các bản esbuild đang cài (0.25.12, 0.28.2) **nằm ngoài range bị ảnh hưởng**; npm gợi ý nâng vite 8 (major) — không áp dụng, lý do ở mục 3 |

Phân loại sử dụng thực tế (đã grep toàn bộ source):

- `zod`: runtime backend — `Server/src/config/env.ts` (env fail-fast),
  `Server/src/routes/schemas.ts` (toàn bộ schema), `Server/src/middleware/validate.ts`,
  `Server/src/middleware/errorHandler.ts`.
- `nodemailer`: runtime backend — chỉ `Server/src/services/mailer.ts`
  (adapter SMTP/Console/Unconfigured cho luồng quên mật khẩu).
- `vitest`, `@vitest/mocker`, `tinypool`: chỉ test/build
  (`Server/vitest.config.ts`, `apps/*/vite.config.ts`, các file `*.test.ts(x)`);
  không import trong runtime.

## 2. Thay đổi phiên bản (trước → sau) và lý do

| Package | Trước | Sau | Lý do chọn |
|---------|-------|-----|-----------|
| nodemailer | 6.10.1 (`^6.9.16`) | **7.0.13** (`^7.0.13`) | Bản vá npm đề xuất và là bản ổn định mới nhất của dòng 7.x tại thời điểm sửa; vá toàn bộ nhóm advisory ở mục 1. API dùng trong `mailer.ts` (`createTransport({host, port, secure, auth})`, `sendMail({from, to, subject, text})`) không đổi ở v7; typecheck + test luồng reset đều PASS mà không cần sửa code. Không gửi email thật khi kiểm chứng |
| @types/nodemailer | 6.4.24 (lock) | **7.0.12** (`^7.0.12`) | Types phải khớp major với runtime nodemailer 7; chỉ ảnh hưởng biên dịch TypeScript |
| vitest | 3.2.7 (`^3.0.2`) ở Server + storefront + admin | **4.1.12** (`^4.1.12`) | Dòng 3.x không còn bản vá (3.2.7 là cuối dòng 3); 4.1.12 là bản ổn định mới nhất của dòng 4 (dist-tag `V4`) tại thời điểm sửa, yêu cầu Node `^20 \|\| ^22 \|\| >=24` — khớp Node 24 của cả sandbox và Windows. Cấu hình test hiện tại (`environment`, `setupFiles`, `testTimeout`, `fileParallelism`, jsdom cho apps) chạy nguyên trạng ở v4, **không sửa file test nào, không bỏ assertion nào**. Không chọn 5.0.5 (major vừa phát hành, ngoài phạm vi tối thiểu của remediation) |
| @vitest/mocker | 3.2.7 | **4.1.12** | Dependency đi kèm vitest, tự nâng theo |
| tinypool | 1.1.1 | **bị loại bỏ hoàn toàn** | Vitest 4 không còn phụ thuộc tinypool (đã đổi cơ chế pool); advisory biến mất cùng dependency |
| zod | 3.25.76 | **giữ nguyên 3.25.76** | Xem mục 3 |

Lockfile được cập nhật hoàn toàn bằng npm (`npm install`), không sửa tay
integrity hash. Không chạy `npm audit fix --force`, không nâng major hàng
loạt (vite giữ 6.4.5, react giữ 19, express giữ 4).

## 3. Advisory chưa nâng và lý do (không tuyên bố "sạch tuyệt đối")

1. **zod (moderate, production)** — Bằng chứng từ chính baseline audit:
   npm đề xuất bản vá `3.25.76` và đó là phiên bản đang cài, đồng thời là
   bản ổn định cuối của dòng 3.x. Không tồn tại bản vá 3.x nào mới hơn.
   Lên Zod 4 là một migration breaking (ví dụ `ZodTypeDef` bị gỡ khỏi API
   mà `Server/src/middleware/validate.ts` đang dùng, cú pháp string-format
   thay đổi) — vượt phạm vi "sửa tối thiểu" của đợt này khi bằng chứng
   audit cho thấy bản cài đã bằng bản vá npm đề xuất. Giảm thiểu theo
   cách dùng thực tế: toàn bộ schema là cố định trong code, không bao giờ
   biên dịch input của người dùng thành schema; validation chỉ parse dữ
   liệu theo shape cố định. **Việc cần làm tiếp (ngoài đợt này):** sau khi
   merge nhánh này, chạy lại `npm audit` trên Windows; nếu zod vẫn bị gắn
   cờ, lên kế hoạch migration Zod 4 ở một PR riêng kèm kiểm thử toàn bộ
   schema/error-handling.
2. **esbuild/vite (moderate, dev only)** — Các bản esbuild đang cài
   (0.25.12, 0.28.2) nằm ngoài range bị ảnh hưởng (`<=0.24.2`) của
   GHSA-67mh-4wv8-2f99; rủi ro chỉ tồn tại khi chạy dev server và bị lộ ra
   mạng không tin cậy. Không nâng vite 8 (major, thay đổi lớn ngoài phạm
   vi Phase 1). Giảm thiểu: chỉ chạy `vite dev` trên localhost khi phát
   triển, không expose dev server ra LAN/internet, production dùng bản
   build tĩnh (không chứa esbuild dev server).

## 4. File đã thay đổi

| File | Thay đổi |
|------|----------|
| `Server/package.json` | `nodemailer ^6.9.16 → ^7.0.13`; `vitest ^3.0.2 → ^4.1.12`; `@types/nodemailer ^6.4.17 → ^7.0.12` |
| `apps/storefront/package.json` | `vitest ^3.0.2 → ^4.1.12` |
| `apps/admin/package.json` | `vitest ^3.0.2 → ^4.1.12` |
| `package-lock.json` | npm 11.12.1 cập nhật theo các thay đổi trên (vitest tree 4.1.12, nodemailer 7.0.13, loại bỏ tinypool và các gói chỉ thuộc vitest 3) |
| `docs/SECURITY_REMEDIATION_REPORT.md` | File này (mới) |

Không thay đổi file source nào, không thay đổi file test nào.

## 5. Kiểm thử bắt buộc — lệnh đã chạy và kết quả chính xác

Môi trường: sandbox, Node v24.22.1, npm 11.12.1 (qua npx, khớp Windows).

| Lệnh | Kết quả |
|------|---------|
| `npm ci` | **PASS** — cài sạch từ lockfile mới, exit 0 |
| `npm run lint` | **PASS** — ESLint 0 lỗi, exit 0 |
| `npm run typecheck` | **PASS** — server + storefront + admin, 0 lỗi (xác nhận tương thích types của nodemailer 7 và vitest 4) |
| `npm test` | **PASS** — Server **44/44** (auth 13, catalog 13, models 4, unit 14), storefront **2/2**, admin **1/1** |
| `npm run build` | **PASS** — contracts + server (tsc) + storefront + admin (Vite), exit 0 |
| Runtime API thật (script Phase 1, 34 kiểm tra HTTP, backend bản build nối MongoDB 8.0.4 replica set riêng + DB test mới `cutishop1_runtime_test_sec5`) | **PASS 34/34** |
| `npm audit` sau sửa | **BLOCKED** — xem mục 6 |

Các hành vi nghiệp vụ trọng yếu được xác minh qua test tích hợp +
runtime (không chỉ qua mock):

- Register/login/refresh/logout; refresh-token **reuse bị phát hiện và
  thu hồi toàn bộ phiên** (401 `SESSION_REVOKED`); CSRF guard trên refresh.
- Forgot/reset password: phản hồi không lộ email có tồn tại hay không;
  reset token dùng một lần, **dùng lại bị từ chối**, token hết hạn bị
  từ chối, phiên cũ bị thu hồi sau reset.
- RBAC: anonymous 401, user thường 403, admin 200 trên API admin; không
  có endpoint tự nâng quyền admin.
- Catalog: CRUD admin, validation schema (400 khi sai), trùng SKU 409,
  giá biến thể ghi đè thắng giá sale, phân trang phía server (13 mục:
  trang 1 = 12, trang 2 = 1), lọc brand/inStock, sort priceAsc, sort/id
  sai → 400, chi tiết không tồn tại → 404.
- Mailer adapter ở chế độ dev: luồng quên mật khẩu chạy end-to-end qua
  ConsoleMailer (liên kết reset chỉ xuất hiện trong log server,
  `[dev-mail] ... (development console mailer — no email was sent)`) —
  **không có email thật nào được gửi**.

Lưu ý trung thực về một sự cố khi chạy test lần đầu trên Vitest 4: 4 file
trong thư mục `Server/dist/` (artifact build cũ ở máy local, đã có trong
`.gitignore`, không nằm trên GitHub) bị Vitest 4 nhặt lên chạy như test
và fail. Đã xử lý bằng cách xoá thư mục `dist/` local rồi chạy lại —
không sửa bất kỳ file test hay assertion nào; lần chạy lại PASS toàn bộ
như bảng trên. Trên Windows, chạy `npm run build` sau `npm test` (hoặc
xoá `Server/dist` trước khi test) để tránh gặp lại.

## 6. Giới hạn và BLOCKED

- **`npm audit` sau sửa: BLOCKED trong sandbox.** Sau lần chạy thành công
  duy nhất ở baseline, mọi lần gọi audit tiếp theo (hơn 10 lần, cả npm
  10.9.4 lẫn 11.12.1, cả hai endpoint `/-/npm/v1/security/audits/quick` và
  `/-/npm/v1/security/advisories/bulk`) đều bị proxy ra ngoài của sandbox
  trả **403 `policy_denied`**. Đây là giới hạn môi trường sandbox, không
  phải lỗi của repo. Vì vậy kết quả audit sau sửa **chưa được xác minh
  bằng chính npm audit trong sandbox**; phần đã xác minh được bằng chứng
  cài đặt thực tế (`npm ls` sau sửa: vitest 4.1.12, @vitest/mocker
  4.1.12, tinypool không còn tồn tại, nodemailer 7.0.13, zod 3.25.76).
  Người dùng cần chạy lại `npm audit` trên Windows (mục 7) để có con số
  cuối cùng; kỳ vọng các advisory của nodemailer/vitest/mocker/tinypool
  biến mất, còn lại tối đa zod và esbuild/vite như phân tích ở mục 3.
- **npm 10.9.4 (đi kèm sandbox) không dùng được cho đợt nâng cấp này:**
  arborist của nó crash (`Cannot read properties of null (reading
  'edgesOut')`) khi resolve peer set của vitest 4 và báo ETARGET sai cho
  `@types/nodemailer@^7.0.12`. npm 11.12.1 (đúng bản trên Windows của
  người dùng) xử lý cả hai bình thường; toàn bộ install/lockfile của đợt
  này được thực hiện bằng npm 11.12.1.
- Gửi email thật qua SMTP: **NOT RUN** (không cấu hình SMTP; chỉ kiểm
  chứng adapter dev như Phase 1).
- E2E trình duyệt: **NOT RUN** trong đợt này (không thuộc phạm vi
  security remediation; trạng thái giữ nguyên như báo cáo Phase 1).

## 7. Hướng dẫn chạy lại trên Windows (Node v24.15.0, npm 11.12.1)

```powershell
git fetch origin
git checkout fix/phase1-security-audit
npm ci
npm audit
npm run lint
npm run typecheck
npm test
npm run build
```

- `npm audit` là bước xác minh cuối cùng của đợt remediation này (trong
  sandbox bị chặn như mục 6). Nếu output vẫn còn gắn cờ zod hoặc
  esbuild/vite, đối chiếu với phân tích ở mục 3 trước khi quyết định
  nâng cấp tiếp.
- Nếu `npm test` báo fail ở các file trong `Server/dist`, đó là artifact
  build cũ: xoá thư mục `Server\dist` rồi chạy lại (dist được tạo lại khi
  `npm run build`).

## 8. Cam kết phạm vi

- Không merge PR #1, không merge PR remediation này, không deploy.
- Không `npm audit fix --force`, không sửa tay lockfile, không xoá/sửa
  test để che lỗi, không thêm tính năng nghiệp vụ mới.
- Không in/ghi giá trị bí mật hay `.env`; môi trường runtime kiểm chứng
  chỉ dùng credential test tổng hợp trong sandbox.
