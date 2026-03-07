---
name: Module import điểm danh từ Excel với preview
overview: Tạo module import dữ liệu điểm danh từ file Excel với tính năng duyệt và preview dữ liệu trước khi xác nhận import, cho phép người dùng kiểm tra và chỉnh sửa mapping trước khi commit vào database.
todos: []
isProject: false
---

# Module import điểm danh từ Excel với preview

## Tổng quan

Module này cho phép import dữ liệu điểm danh từ file Excel dạng bảng rộng (wide format), với tính năng **duyệt và preview dữ liệu** trước khi xác nhận import. Người dùng có thể kiểm tra mapping, validate dữ liệu, và chỉnh sửa trước khi commit.

## Cấu trúc dữ liệu đầu vào

### Format Excel mong đợi:

- **Hàng 1**: Header với các cột: Mã HV, Họ tên, [Tháng-Buổi 1], [Tháng-Buổi 2], ...
- **Các hàng tiếp theo**: Dữ liệu điểm danh
- **Giá trị điểm danh**: X (có mặt), B (vắng), M (muộn), P (có mặt), hoặc để trống

### Ví dụ cấu trúc:

```
| Mã HV | Họ tên        | 6.2025-B1 | 6.2025-B2 | 7.2025-B1 | ... |
|-------|---------------|-----------|-----------|-----------|-----|
| HV001 | Nguyễn Văn A  | X         | B         | X         | ... |
| HV002 | Trần Thị B    | X         | X         | M         | ... |
```

## Backend API

### 1. Endpoint: POST `/api/attendance/bulk-import`

**File**: `server/routes/attendance.js`

**Request body**:

```json
{
  "attendance": [
    {
      "maHV": "HV001",
      "hoTen": "Nguyễn Văn A",
      "classId": 1,
      "records": [
        {
          "thang": "6.2025",
          "buoi": 1,
          "value": "X",
          "note": ""
        }
      ]
    }
  ],
  "options": {
    "createSessionsIfNotExists": false,
    "updateExisting": true
  }
}
```

**Logic xử lý**:

1. Validate dữ liệu đầu vào
2. Tìm học sinh bằng `maHV` và `hoTen`
3. Tìm session bằng `classId`, `thang`, và `buoi`
4. Nếu `createSessionsIfNotExists = true` và session chưa tồn tại: tạo session mới
5. Insert hoặc update attendance record
6. Trả về kết quả: `{ success: [], errors: [] }`

### 2. Endpoint: POST `/api/attendance/validate-import`

**File**: `server/routes/attendance.js`

Endpoint mới để validate dữ liệu trước khi import (không commit vào database):

**Request body**: Giống như `bulk-import` nhưng chỉ validate

**Response**:

```json
{
  "valid": true,
  "preview": [
    {
      "rowIndex": 1,
      "maHV": "HV001",
      "hoTen": "Nguyễn Văn A",
      "student": { "id": 1, "maHV": "HV001", "hoTen": "Nguyễn Văn A", "classId": 1 },
      "records": [
        {
          "thang": "6.2025",
          "buoi": 1,
          "value": "X",
          "session": { "id": 45, "ngayHoc": "2025-06-05", "exists": true },
          "attendance": { "id": 123, "exists": true, "willUpdate": true }
        }
      ],
      "warnings": [],
      "errors": []
    }
  ],
  "summary": {
    "totalRows": 50,
    "validRows": 48,
    "invalidRows": 2,
    "totalRecords": 200,
    "newRecords": 150,
    "updateRecords": 48,
    "errorRecords": 2
  },
  "errors": [
    { "rowIndex": 25, "maHV": "HV999", "error": "Không tìm thấy học sinh" }
  ]
}
```

## Frontend

### 1. Cập nhật `app/src/api.js`

Thêm vào `attendanceApi`:

```javascript
validateImport: (body) => request('/attendance/validate-import', { 
  method: 'POST', 
  body: JSON.stringify(body) 
}),
bulkImport: (body) => request('/attendance/bulk-import', { 
  method: 'POST', 
  body: JSON.stringify(body) 
})
```

### 2. Component: `app/src/pages/AttendanceImport.jsx`

Hoặc thêm dialog vào trang Attendance hiện có.

**UI Flow với Preview**:

#### Bước 1: Upload File

- Button "Import điểm danh" → Mở dialog
- Chọn file Excel
- Parse file và hiển thị loading

#### Bước 2: Mapping Configuration

- Hiển thị dialog với các tab:
  - **Tab "Mapping"**: 
    - Chọn cột "Mã HV" (dropdown từ headers)
    - Chọn cột "Họ tên" (dropdown từ headers)
    - Chọn lớp (nếu import cho nhiều lớp)
    - Hiển thị các cột điểm danh đã detect tự động
    - Cho phép chỉnh sửa mapping thủ công
  - **Tab "Preview"**: 
    - Hiển thị bảng preview dữ liệu đã parse
    - Highlight các dòng có lỗi (màu đỏ) hoặc cảnh báo (màu vàng)
    - Hiển thị mapping: học sinh → student ID, session → session ID
    - Cho phép filter: "Tất cả", "Có lỗi", "Cảnh báo", "Hợp lệ"
    - Pagination nếu dữ liệu nhiều

#### Bước 3: Validation

- Click "Kiểm tra dữ liệu" → Gọi `/validate-import`
- Hiển thị kết quả validation:
  - Summary card: Tổng số dòng, hợp lệ, lỗi
  - Bảng chi tiết với các cột:
    - STT
    - Mã HV
    - Họ tên
    - Học sinh (matched) - hiển thị tên hoặc "Không tìm thấy"
    - Các cột điểm danh với giá trị
    - Session (matched) - hiển thị ngày học hoặc "Chưa có"
    - Trạng thái (Hợp lệ / Cảnh báo / Lỗi)
    - Hành động (sẽ Insert / Update / Bỏ qua)
  - Filter và search trong bảng
  - Expand/collapse để xem chi tiết từng record

#### Bước 4: Review & Edit

- Cho phép chỉnh sửa trực tiếp trong bảng preview:
  - Sửa giá trị điểm danh
  - Chọn học sinh khác nếu mapping sai
  - Chọn session khác hoặc tạo mới
  - Xóa các dòng không muốn import
- Hiển thị tooltip/thông tin khi hover:
  - Thông tin học sinh đã match
  - Thông tin session đã match
  - Giá trị hiện tại trong database (nếu update)

#### Bước 5: Confirm Import

- Button "Xác nhận Import" → Gửi request `/bulk-import`
- Hiển thị progress bar
- Sau khi import xong, hiển thị kết quả:
  - Thành công: X dòng đã import
  - Lỗi: Danh sách lỗi (nếu có)
  - Có thể export log lỗi ra file

### 3. Utility: `app/src/utils/attendanceImportParser.js`

Module parse file Excel:

**Functions**:

- `parseExcelFile(file)`: Đọc và parse file Excel
- `detectHeaderRow(data)`: Tự động phát hiện hàng header
- `parseAttendanceColumns(headers)`: Parse các cột điểm danh từ header
- `mapStudent(studentData, studentsList)`: Map học sinh với kết quả matching
- `validateAttendanceData(parsedData, students, sessions)`: Validate dữ liệu
- `transformToImportFormat(parsedData, classId)`: Transform sang format API
- `formatPreviewData(parsedData, validationResult)`: Format dữ liệu cho preview table

### 4. Component: `app/src/components/AttendanceImportPreview.jsx`

Component hiển thị bảng preview:

**Props**:

- `data`: Dữ liệu đã parse và validate
- `onEdit`: Callback khi edit một cell
- `onDelete`: Callback khi xóa một row
- `onFilterChange`: Callback khi filter thay đổi

**Features**:

- Table với sticky header
- Sortable columns
- Inline editing
- Row selection (checkbox)
- Bulk actions (xóa nhiều dòng)
- Export preview data ra Excel
- Highlight errors/warnings với màu sắc

## Chi tiết UI Preview

### Preview Table Columns:

1. **Checkbox** - Chọn/bỏ chọn dòng để import
2. **STT** - Số thứ tự
3. **Mã HV** - Từ file Excel
4. **Họ tên** - Từ file Excel
5. **Học sinh** - Tên học sinh đã match (hoặc "❌ Không tìm thấy")
6. **Lớp** - Tên lớp của học sinh
7. **[Tháng-Buổi columns]** - Giá trị điểm danh với:
  - Background color: Xanh (hợp lệ), Vàng (cảnh báo), Đỏ (lỗi)
  - Tooltip: Session info, existing value (nếu update)
  - Icon: ✨ (mới), 🔄 (update), ❌ (lỗi)
8. **Trạng thái** - Badge: "Hợp lệ" / "Cảnh báo" / "Lỗi"
9. **Hành động** - Dropdown: "Sửa", "Xóa", "Xem chi tiết"

### Summary Cards:

- **Tổng số dòng**: 50
- **Hợp lệ**: 48 (màu xanh)
- **Cảnh báo**: 1 (màu vàng)
- **Lỗi**: 1 (màu đỏ)
- **Sẽ insert**: 150 records
- **Sẽ update**: 48 records

### Filter Options:

- Tất cả
- Chỉ hợp lệ
- Có cảnh báo
- Có lỗi
- Chưa match học sinh
- Chưa match session

### Search:

- Tìm kiếm theo Mã HV, Họ tên

## Validation Rules

### Errors (màu đỏ - không thể import):

- Không tìm thấy học sinh (maHV + hoTen không match)
- Session không tồn tại và không cho phép tạo mới
- Giá trị điểm danh không hợp lệ (không phải X, B, M, P, hoặc trống)
- Thiếu thông tin bắt buộc (maHV hoặc hoTen)

### Warnings (màu vàng - có thể import nhưng cần xem xét):

- Học sinh match bằng tên nhưng không match mã HV
- Session sẽ được tạo mới (nếu cho phép)
- Giá trị điểm danh trống
- Đã có attendance record (sẽ update thay vì insert)

### Valid (màu xanh - sẵn sàng import):

- Tất cả thông tin hợp lệ
- Học sinh và session đã match
- Giá trị điểm danh hợp lệ

## Edit trong Preview

### Inline Editing:

- Click vào cell để edit
- Dropdown cho giá trị điểm danh: X, B, M, P, (trống)
- Dropdown cho chọn học sinh (nếu mapping sai)
- Date picker cho chọn ngày học (nếu cần tạo session mới)
- Auto-save khi blur hoặc Enter

### Bulk Edit:

- Chọn nhiều dòng
- Action: "Đặt giá trị điểm danh cho tất cả", "Xóa các dòng đã chọn"

## Export/Import Preview State

- Lưu preview state vào localStorage (tạm thời)
- Export preview data ra Excel (với các cột bổ sung: status, errors)
- Import lại preview state từ file JSON

## Error Handling & User Feedback

### Loading States:

- Parsing file: "Đang đọc file..."
- Validating: "Đang kiểm tra dữ liệu..."
- Importing: Progress bar với số lượng đã xử lý

### Success Feedback:

- Toast notification: "Đã import thành công X dòng"
- Dialog kết quả với breakdown chi tiết

### Error Feedback:

- Hiển thị lỗi trong preview table
- Dialog lỗi với danh sách chi tiết
- Export log lỗi ra file text/Excel

