# Dashboard Web – Kéo dữ liệu từ Google Sheet

**Không dùng App Script để deploy.** Web chạy local (hoặc deploy tĩnh/bất kỳ host nào), dữ liệu kéo từ Google Sheet qua **Publish to web (CSV)**.

## Chạy local

1. Cài dependency: `npm install`
2. Cấu hình `dev/config.js`: đặt **CSV_URL** = link CSV từ Google Sheet (xem bên dưới).
3. Chạy: `npm run dev` → mở http://localhost:3000  
   **Live reload (tự tải lại khi sửa file):** `npm run dev:live` → mở http://localhost:3000 (sửa HTML/CSS/JS trong `dev/` thì trình duyệt tự reload).

## Cấu hình CSV (Google Sheet)

1. Mở Google Sheet có sheet **"Gộp_Nối_Tiếp"**. Cấu trúc mới (long): Mã HV, Họ tên, Tên, Lớp, Tháng, Buổi, Điểm danh (1 dòng = 1 record).
2. **File → Share → Publish to web**
3. Chọn sheet cần publish → **Format: CSV** → **Publish** → copy link.
4. Trong `dev/config.js` đặt:
   ```js
   window.CSV_URL = 'https://docs.google.com/spreadsheets/d/.../export?format=csv&gid=...';
   ```
   Hoặc dùng proxy (tránh CORS):
   ```js
   window.CSV_URL = '/proxy?url=' + encodeURIComponent('https://docs.google.com/spreadsheets/d/.../export?format=csv&gid=...');
   ```

## CORS

- Gọi trực tiếp CSV từ trình duyệt có thể bị chặn CORS.
- Dùng **proxy**: chạy `npm run dev`, đặt `CSV_URL = '/proxy?url=' + encodeURIComponent('link_csv_đầy_đủ')` (server dev có route `/proxy` để lấy CSV và trả về với CORS).

## Debug kết quả các hàm StreakLogic

Sau khi mở trang Dashboard (http://localhost:3000), mở **DevTools** (F12) → tab **Console**. Các hàm `parseCSV`, `getStreakDataFromRows`, `buildFullResponse` có thể debug như sau:

### 1. Gọi trực tiếp từng hàm

```js
// Parse CSV text → xem số dòng và header
var csv = 'Mã HV,Họ tên,Lớp,Buổi 1\nHV001,Nguyễn A,Lớp 1,X';
var rows = StreakLogic.parseCSV(csv);
console.log('rows:', rows);

// Từ rows → streak data (filterOptions có thể thêm debug: true để có buoiValues)
var raw = StreakLogic.getStreakDataFromRows(rows, { debug: true });
console.log('raw:', raw);

// Build full response
var full = StreakLogic.buildFullResponse(raw.students, raw.months, raw.buois, raw.timelineBuois, {});
console.log('full:', full);
```

### 2. Dùng helper debug (tự log từng bước)

```js
// Chỉ log kết quả parseCSV
StreakLogic.debug.logParseCSV(csvText);

// Chỉ log kết quả getStreakDataFromRows (tự bật debug: true)
StreakLogic.debug.logGetStreakData(rows, { startBuoiIndex: 1, endBuoiIndex: 10 });

// Chỉ log kết quả buildFullResponse
StreakLogic.debug.logBuildFullResponse(raw.students, raw.months, raw.buois, raw.timelineBuois, {});

// Chạy full pipeline (parse → getStreakData → buildFullResponse) và log từng bước
var csvFromFetch = await fetch(window.CSV_URL).then(r => r.text());
StreakLogic.debug.runPipeline(csvFromFetch, { startBuoiIndex: 1, endBuoiIndex: 20 });
```

### 3. Debug với dữ liệu thật (sau khi load trang)

- Thêm `?debug=1` vào URL (vd: http://localhost:3000?debug=1) → mỗi học sinh sẽ có thêm `buoiValues` (mảng giá trị điểm danh từng buổi). Xem trong Console: `allStudents[0].buoiValues`.
- Trong Console có thể gọi lại pipeline với CSV đã tải:  
  `StreakLogic.debug.runPipeline(await fetch(window.CSV_URL).then(r => r.text()), {});`

### 4. Breakpoint trong DevTools

- **Sources** → mở file `dev/streak-logic.js` → click số dòng bên trái để đặt breakpoint tại `parseCSV`, `getStreakDataFromRows` hoặc `buildFullResponse`, rồi refresh trang hoặc thao tác để code chạy qua đó.

## Quyết định học viên (đã thôi học)

Phần **Quyết định học viên** dùng để xác định học viên đã thôi học theo tiêu chí: **buổi học cuối cùng có điểm danh (X/B/M) là trước Buổi 5 tháng 1.2026**.

### Cấu trúc sheet "quyết định học viên"

| Cột | Mô tả |
|-----|-------|
| Mã HV | Mã học viên |
| Họ tên | Họ và tên |
| Lớp | Tên lớp |
| Trạng thái | `bắt đầu nhập học` \| `nghỉ học` \| `đang học` |
| Buổi cuối cùng | Buổi có điểm danh cuối cùng (vd: Tháng 12/2025 Buổi 3) |
| Ghi chú (Lịch sử chăm sóc) | Lý do nghỉ, đã chăm sóc, feedback học viên |

### Trạng thái

- **nghỉ học**: Buổi cuối cùng < Buổi 5 tháng 1.2026
- **đang học**: Buổi cuối cùng ≥ Buổi 5 tháng 1.2026
- **bắt đầu nhập học**: Chưa có điểm danh (X/B/M) nào
- **tái tục**: Cập nhật thủ công trong sheet khi xác nhận học viên quay lại

### Xuất CSV

- **Xuất CSV (chỉ nghỉ học)**: Copy danh sách học viên đã thôi học → paste vào sheet "quyết định học viên"
- **Xuất CSV (tất cả)**: Copy toàn bộ học viên với trạng thái

### Debug

- **Tự động:** Thêm `?debug=1` vào URL (vd: http://localhost:3000?debug=1) → mở DevTools Console (F12) để xem log `[QuyetDinhHocVien]`.
- **Gọi thủ công trong Console:**

```js
var csv = await fetch(window.CSV_URL).then(r => r.text());
var rows = StreakLogic.parseCSV(csv);
var list = QuyetDinhHocVien.getQuyetDinhHocVienFromRows(rows, null, { onlyDroppedOut: true, debug: true });
console.log('Học viên đã thôi học:', list);
console.log(QuyetDinhHocVien.toCSV(list));

// Hoặc chạy full pipeline với debug
QuyetDinhHocVien.debug.runPipeline(await fetch(window.CSV_URL).then(r => r.text()), { onlyDroppedOut: false });
```

## Cấu trúc

- **streak-logic.js**: logic tính streak (port từ App Script), chạy trên dữ liệu CSV/rows.
- **quyet-dinh-hoc-vien.js**: logic xác định học viên đã thôi học, xuất CSV cho sheet "quyết định học viên".
- **config.js**: `CSV_URL` – nguồn dữ liệu.
- **index.html** + **dashboard.css**: giao diện dashboard.
- Không cần deploy App Script; web độc lập, chỉ cần nguồn CSV từ Sheet.
