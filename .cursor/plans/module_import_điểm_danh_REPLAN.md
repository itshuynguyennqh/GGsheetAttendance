# Module import điểm danh – Kế hoạch tổng hợp

## Tổng quan

Module import điểm danh cho phép:
- **Import nhiều lớp cùng lúc**: Mỗi dòng trong Excel xác định lớp qua cột **Lớp** (ví dụ "Lớp 11"); không chọn một lớp cho cả file.
- **Hai kiểu file Excel** (đều hỗ trợ):
  - **Kiểu A**: Header `6.2025-B1`, `6.2025-B2`…; ô chỉ chứa giá trị X/B/M/P.
  - **Kiểu B (theo ảnh)**: Header `Mã HV`, `Họ tên`, `Tên`, `Lớp`, `B1`, `B2`, … (số cột buổi tùy ý, có thể nhiều hơn 6); ô điểm danh chứa chuỗi `Tháng 6.2025||Buổi 1||X`.
- **Duyệt trước khi import**: Upload → Mapping/Preview → Kiểm tra (validate) → Bảng duyệt (filter, tìm kiếm) → Xác nhận Import.

---

## 1. Cấu trúc file Excel

### Kiểu A (header có tháng–buổi)

| Mã HV | Họ tên        | 6.2025-B1 | 6.2025-B2 | 7.2025-B1 |
|-------|---------------|-----------|-----------|-----------|
| HV001 | Nguyễn Văn A  | X         | B         | X         |

- Cột điểm danh: header dạng `M.YYYY-BN` (ví dụ `6.2025-B1`).
- Ô: chỉ giá trị **X** (có mặt), **B** (vắng), **M** (muộn), **P** (có mặt), hoặc trống.

### Kiểu B (theo ảnh – có cột Lớp, ô dạng chuỗi)

| Mã HV      | Họ tên         | Tên | Lớp    | B1                    | B2                    | … |
|------------|----------------|-----|--------|------------------------|------------------------|---|
| HV-0000431 | Nguyễn Uyển Nhi| Nhi | Lớp 11 | Tháng 6.2025\|\|Buổi 1\|\|X | Tháng 6.2025\|\|Buổi 2\|\|M | … |

- **Mã HV**: có thể có dấu gạch (HV-0000431); hệ thống match cả HV0000431.
- **Lớp**: tên lớp trong hệ thống (map sang `classId`). Bắt buộc khi import đa lớp.
- **B1, B2, … Bn**: header chỉ là B1, B2, B3, … (số cột tùy ý, không giới hạn 6 buổi; có thể B7, B8, …). **Nội dung ô** là chuỗi `Tháng M.YYYY||Buổi N||Trạng thái`:
  - Trạng thái: **X**, **P**, **M**, **B**, **-** (gạch ngang = trống/không ghi).

---

## 2. Backend (đã có, không đổi)

- **POST `/api/attendance/validate-import`**: Nhận payload giống bulk-import, chỉ validate, trả về `preview`, `summary`, `errors` (không ghi DB).
- **POST `/api/attendance/bulk-import`**: Nhận `{ attendance: [{ maHV, hoTen, classId, records: [{ thang, buoi, value, note }] }], options: { createSessionsIfNotExists, updateExisting } }`, ghi DB.
- Helper: tìm/tạo session theo `classId`, `thang`, `buoi`; tìm học sinh theo `maHV`/`hoTen`.

---

## 3. Frontend – Parser ([app/src/utils/attendanceImportParser.js](app/src/utils/attendanceImportParser.js))

| Thành phần | Nội dung |
|------------|----------|
| **parseExcelFile(file)** | Đọc Excel, trả về mảng hàng (header + data). |
| **parseHeaderMapping(headers)** | Trả về `{ maHVCol, hoTenCol, lopCol, attendanceCols }`. `lopCol` = cột Lớp (-1 nếu không có). `attendanceCols`: kiểu A = `{ colIndex, thang, buoi }`; kiểu B = `{ colIndex, fromCell: true }` (nhận mọi header B1, B2, … Bn, không giới hạn 6 cột). |
| **parseAttendanceCellValue(cellText)** | Parse chuỗi `Tháng M.YYYY||Buổi N||X/P/M/B/-` → `{ thang, buoi, value }`. |
| **parseAttendanceData(rows, mapping, classesOrClassId)** | Nếu `classesOrClassId` là mảng: resolve `classId` từ cột Lớp (`resolveClassIdFromName`). Nếu là number: dùng làm classId chung (file cũ). Với cột `fromCell`: dùng `parseAttendanceCellValue`; không fromCell: value từ ô, thang/buoi từ header. |
| **resolveClassIdFromName(className, classes)** | Map tên lớp (vd "Lớp 11") sang `classId` (so sánh chuẩn hóa tên). |
| **mapStudent(…)** | Match học sinh: chuẩn hóa Mã HV (HV-0000431 ↔ HV0000431), ưu tiên maHV rồi hoTen trong lớp. |
| **transformToImportFormat(parsedData)** | Trả về mảng `{ maHV, hoTen, classId, records }` (mỗi row dùng `row.classId`). |
| **formatPreviewData(parsedData, validationResult)** | Gộp preview từ API với parsedData cho bảng duyệt. |

---

## 4. Frontend – Dialog ([app/src/components/AttendanceImportDialog.jsx](app/src/components/AttendanceImportDialog.jsx))

- **Bước 1 – Chọn file**: Upload Excel, (tùy chọn) tải file mẫu. **Không** có dropdown "Chọn lớp" cho cả file.
- **Bước 2 – Mapping & Preview**: Hiển thị đã nhận diện (Mã HV, Họ tên, Lớp nếu có, số cột điểm danh). Checkbox "Tạo session nếu chưa có", "Cập nhật bản ghi đã có". Nút **Kiểm tra dữ liệu** → gọi `validate-import`, chuyển sang bước 3.
- **Bước 3 – Duyệt & Import**: Thẻ tổng quan (tổng dòng, hợp lệ, lỗi). Bảng preview (có cột Lớp đã map). Filter theo trạng thái, tìm theo Mã HV/Họ tên. Nút **Xác nhận Import** → gọi `bulk-import`, hiển thị kết quả.

- Khi parse file: gọi `parseAttendanceData(rows, mapping, classes)` (truyền danh sách lớp).
- Khi validate/import: gọi `transformToImportFormat(parsedData)` (không truyền classId chung).

---

## 5. Frontend – Preview ([app/src/components/AttendanceImportPreview.jsx](app/src/components/AttendanceImportPreview.jsx))

- Bảng: checkbox, STT, Mã HV, Họ tên, **Lớp** (tên lớp đã map), các cột điểm danh, Trạng thái (Hợp lệ/Cảnh báo/Lỗi).
- Filter: Tất cả / Hợp lệ / Cảnh báo / Lỗi.
- Tìm kiếm: Mã HV, Họ tên.

---

## 6. Template Excel ([app/src/utils/attendanceImportTemplate.js](app/src/utils/attendanceImportTemplate.js))

- Header: **Mã HV**, **Họ tên**, **Tên**, **Lớp**, **B1**, **B2**, **B3**, **B4**, **B5**, **B6** (có thể thêm B7, B8, … tùy mẫu; số cột buổi không giới hạn).
- Dòng mẫu: Mã HV dạng HV-0000431, Họ tên, Tên, Lớp = "Lớp 11"; ô B1–B6 (hoặc nhiều hơn) = chuỗi `Tháng 6.2025||Buổi 1||X`, `Tháng 6.2025||Buổi 2||M`, … (vài tháng/buổi và X/P/M/B/-).

---

## 7. Luồng dữ liệu

```
Excel (Kiểu A hoặc B)
    → parseExcelFile → parseHeaderMapping (lopCol, attendanceCols)
    → parseAttendanceData(rows, mapping, classes)  → classId/dòng từ Lớp, records từ ô hoặc parseCellValue
    → transformToImportFormat(parsedData)          → payload từng row có classId riêng
    → validate-import (preview) / bulk-import (ghi DB)
```

---

## 8. Kiểm tra nhanh

- File có cột Lớp: mỗi dòng map đúng lớp, import nhiều lớp một lần.
- File Kiểu B: ô "Tháng 6.2025||Buổi 1||X" → record đúng thang, buoi, value.
- **Số cột buổi không giới hạn 6**: file có B1–B10 hoặc nhiều hơn vẫn import đúng; parser nhận mọi header dạng B1, B2, … Bn.
- Mã HV "HV-0000431" và "HV0000431" đều match cùng học sinh.
- Dialog không còn chọn một lớp cho cả file; lớp lấy từ cột Lớp.
- Duyệt: xem preview, filter, tìm kiếm, rồi mới bấm Xác nhận Import.
