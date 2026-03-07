# 📚 TÀI LIỆU KỸ THUẬT - HỆ THỐNG QUẢN LÝ ĐIỂM DANH & BTVN

## 📋 MỤC LỤC

1. [Tổng quan hệ thống](#tổng-quan-hệ-thống)
2. [Kiến trúc & Cấu trúc Codebase](#kiến-trúc--cấu-trúc-codebase)
3. [Flow xử lý chính](#flow-xử-lý-chính)
4. [Chi tiết các module](#chi-tiết-các-module)
5. [Dữ liệu & Nguồn dữ liệu](#dữ-liệu--nguồn-dữ-liệu)
6. [Đề xuất cải thiện & Mở rộng](#đề-xuất-cải-thiện--mở-rộng)

---

## 🎯 TỔNG QUAN HỆ THỐNG

### Mục đích
Hệ thống quản lý điểm danh và bài tập về nhà (BTVN) cho trung tâm giáo dục, được xây dựng trên **Google Apps Script** và tích hợp với **Google Sheets**.

### Các chức năng chính
1. **Quản lý điểm danh**: Theo dõi sự chuyên cần học sinh theo tháng/buổi
2. **Xử lý BTVN Azota**: Tự động kéo điểm và nhận xét từ hệ thống Azota
3. **Tạo báo cáo**: Tạo báo cáo tổng hợp gửi phụ huynh
4. **Cảnh báo vi phạm**: Phát hiện học sinh có vấn đề (thiếu BTVN, nghỉ nhiều, ý thức kém)
5. **Dashboard Streak**: Theo dõi chuỗi đi học/nghỉ liên tiếp
6. **AI Trợ lý**: Tạo đáp án và báo cáo học tập tự động bằng Gemini AI

### Công nghệ sử dụng
- **Platform**: Google Apps Script (JavaScript ES5/ES6)
- **Storage**: Google Sheets
- **External APIs**: 
  - Google Gemini API (AI)
  - Google Drive API (đọc file)
- **Frontend**: HTML/CSS/JavaScript (cho Dashboard Web)

---

## 🏗️ KIẾN TRÚC & CẤU TRÚC CODEBASE

### Cấu trúc thư mục (rootDir: gs/)
```
GGsheetDiemDanh/
├── gs/                        # Apps Script (clasp rootDir)
│   ├── Config.js              # GEMINI_API_KEY, getGeminiUrl, cấu hình
│   ├── Menu.js                # onOpen() - Menu chính
│   ├── Dialogs.js             # showJoinSheetsDialog, showDateRangePicker, ...
│   ├── core/
│   │   ├── Helpers.js         # parseDate, formatDateVN, parseScore
│   │   └── CommentAnalysis.js # analyzeCommentText, normalizeHVCode
│   ├── reports/
│   │   ├── ReportGeneration.js  # generateRangeReport, evaluateIndicators
│   │   └── MessageTemplates.js  # generateMessage, formatChiTietDiem
│   ├── btvn/
│   │   ├── BTVNLogic.js       # processBTVNAzota, createColumnMapping
│   │   └── BTVNAzotaExternal.js
│   ├── join/JoinLogic.js      # processJoinSheets, manualJoinAllMonthlySheets
│   ├── attendance/AttendanceLogic.js  # processAttendanceExport
│   ├── dashboard/
│   │   ├── DashboardLogic.js  # createStreakDashboard, getStreakDataForWeb
│   │   └── DashboardMenu.js   # openDashboardWeb, getThangSheets
│   ├── warnings/              # showWarningDialog, showAttendanceWarningDialog, ...
│   ├── details/DetailDialog.js
│   ├── ai/GeminiService.js    # showAiInputDialog
│   ├── JoinDialog.html
│   ├── AttendanceDialog.html
│   ├── Dashboard.html
│   ├── DashboardStyles.html
│   └── appsscript.json
├── .clasp.json
└── package.json
```

### Kiến trúc tổng thể

```
┌─────────────────────────────────────────────────┐
│         GOOGLE SHEETS (Data Layer)              │
│  - BaoCao                                       │
│  - Gộp_Nối_Tiếp                                 │
│  - Tháng X.YYYY (sheets)                        │
│  - External Sheet (Azota data)                  │
└─────────────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────────────┐
│      GOOGLE APPS SCRIPT (Logic Layer)           │
│  ┌──────────────┐  ┌──────────────┐            │
│  │ BTVNLogic    │  │ Attendance   │            │
│  │              │  │ Logic        │            │
│  └──────────────┘  └──────────────┘            │
│  ┌──────────────┐  ┌──────────────┐            │
│  │ Dashboard    │  │ JoinLogic    │            │
│  │ Logic        │  │              │            │
│  └──────────────┘  └──────────────┘            │
│  ┌──────────────────────────────────────┐       │
│  │ Menu.js, Dialogs.js, Config.js       │       │
│  │ reports/, ai/ (Reports, AI)          │       │
│  └──────────────────────────────────────┘       │
└─────────────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────────────┐
│      EXTERNAL SERVICES                          │
│  - Google Gemini API (AI)                      │
│  - Google Drive (File reading)                 │
│  - External Google Sheet (Azota)               │
└─────────────────────────────────────────────────┘
```

---

## 🔄 FLOW XỬ LÝ CHÍNH

### 1. Flow xử lý BTVN Azota (`processBTVNAzota`)

```
┌─────────────────────────────────────────────────┐
│ 1. User chọn vùng dữ liệu trong sheet "BaoCao"  │
│    - Dòng đầu: Format/Mã BTVN (x)                │
│    - Các dòng sau: Mã học viên (hv)             │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ 2. Mở External Google Sheet                    │
│    ID: 1D0JR4CNSGdCqelFQwYpVdjP8DkJkRUqoKPdUVnIs1lo│
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ 3. extractHashids()                             │
│    - Tìm x trong sheet "Danh sách Bài"         │
│    - Khi Format thay đổi → lấy y (Format mới)   │
│    - Extract hashid từ URL "Link Kết quả"       │
│    - Return: [hashid1, hashid2, ...]            │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ 4. createStudentDictionary()                    │
│    - Lấy 3 số cuối của mã HV                    │
│    - Match với cột Y trong "Tổng hợp HS"        │
│    - Tạo dict: {mãHV: giá_trị_cột_K}           │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ 5. matchAndGetScores()                          │
│    - Duyệt "Tổng hợp BTVN"                      │
│    - Match: hashid + mã HV                      │
│    - Lấy điểm và đánh giá                        │
│    - Nhiều bài → chọn điểm cao nhất             │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ 6. writeResultsToBaoCao()                        │
│    - Ghi kết quả vào cột "Kết quả"              │
│    - Tô màu cam cho "Chưa làm" hoặc "Chưa đạt" │
└─────────────────────────────────────────────────┘
```

**Đánh giá điểm:**
- Không có điểm → "Chưa làm BTVN Azota"
- Điểm < 5 → "Làm chưa đạt yêu cầu: X.X điểm"
- 5 ≤ Điểm < 7 → "Đã làm bài ở mức điểm khá: X.X điểm"
- Điểm ≥ 7 → "Đã làm bài tốt với: X.X điểm"

### 2. Flow gộp dữ liệu nhiều tháng (`processJoinSheets`)

```
┌─────────────────────────────────────────────────┐
│ 1. User chọn các sheet "Tháng X.YYYY"           │
│    (hoặc tự động tìm tất cả)                    │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ 2. Tự động phát hiện cột "Buổi"                 │
│    - Tìm header bắt đầu bằng "Buổi"             │
│    - Lấy dữ liệu từ các cột này                 │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ 3. Thu thập dữ liệu                             │
│    - Group theo Mã HV                           │
│    - Format: "Tháng X||Buổi Y||X/P"            │
│    - Dồn buổi theo thời gian                    │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ 4. Ghi vào sheet "Gộp_Nối_Tiếp"                 │
│    - Header: Mã HV, Họ tên, Tên, Lớp, B1, B2...│
│    - Định dạng: màu X/P, border, frozen         │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ 5. Tự động cập nhật Dashboard (nếu có)          │
└─────────────────────────────────────────────────┘
```

### 3. Flow tính toán Streak (`calculateStreak`)

```
Input: Array các giá trị điểm danh [X, P, X, X, P, ...]
                    ↓
┌─────────────────────────────────────────────────┐
│ Filter: Chỉ giữ X, B, M, P                      │
│ (Bỏ qua: ?, -, "", giá trị khác)               │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ Duyệt từ đầu → cuối:                            │
│ - Tìm maxAttendStreak (chuỗi đi học dài nhất)   │
│ - Tìm maxAbsenceStreak (chuỗi nghỉ dài nhất)   │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ Duyệt ngược từ cuối → đầu:                      │
│ - Tìm currentStreak (chuỗi hiện tại)           │
│ - Dương = đi học, Âm = nghỉ                     │
└─────────────────────────────────────────────────┘
                    ↓
Return: {currentStreak, maxAttendStreak, maxAbsenceStreak}
```

### 4. Flow AI Trợ lý (`processAiTasks`)

```
┌─────────────────────────────────────────────────┐
│ 1. User nhập File ID (Google Drive)             │
│    - File Word/Ảnh bài tập                      │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ 2. User chọn vùng danh sách học sinh            │
│    - Trong sheet hiện tại                       │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ 3. Đọc file từ Google Drive                     │
│    - Convert sang base64                        │
│    - Lấy MIME type                              │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ 4. Xây dựng prompt cho Gemini AI                │
│    - Nhiệm vụ 1: Tạo đáp án                    │
│    - Nhiệm vụ 2: Báo cáo học tập                │
│    - Kèm danh sách học sinh                     │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ 5. Gọi Gemini API (v1beta)                      │
│    - Model: gemini-2.0-flash                    │
│    - Payload: text + inline_data (file)         │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ 6. Xuất kết quả ra Sheet mới                   │
│    - Tên: "Kết quả AI HH:mm"                    │
│    - Format: wrap text, column width 600        │
└─────────────────────────────────────────────────┘
```

---

## 📦 CHI TIẾT CÁC MODULE

### 1. BTVNLogic.js

**Chức năng**: Xử lý kéo điểm BTVN từ Azota về sheet "BaoCao"

**Các hàm chính:**

#### `processBTVNAzota()`
- **Input**: Vùng được chọn trong sheet "BaoCao"
- **Output**: Ghi kết quả vào cột "Kết quả"
- **Dependencies**: External Google Sheet

#### `extractHashids(externalSS, x)`
- **Logic đặc biệt**: 
  - Tìm x trong cột Format
  - Khi Format thay đổi → lấy y (Format mới)
  - Extract hashid từ URL: `https://azota.vn/de-thi/pkarzl` → `pkarzl`
- **Return**: Array các hashid

#### `createStudentDictionary(externalSS, hvArray)`
- **Logic**: Match 3 số cuối của mã HV với cột Y
- **Return**: Dictionary `{mãHV: giá_trị_cột_K}`

#### `matchAndGetScores(externalSS, hashidArray, studentDict)`
- **Logic**: 
  - Match hashid (cột D) + mã HV (cột E)
  - Match chính xác hoặc theo 3 số cuối
  - Nhiều bài → chọn điểm cao nhất
- **Return**: Dictionary `{mãHV: result_string}`

#### `findColumnIndex(sheet, columnName, headerRow)`
- **Tính năng**: Tự động tìm cột theo header hoặc tên Excel
- **Fallback**: Hỗ trợ tên Excel (A, B, C...) hoặc index số

### 2. AttendanceLogic.js

**Chức năng**: Xuất điểm danh từ sheet tháng sang "BaoCao"

**Hàm chính:**

#### `processAttendanceExport(startRow, endRow, sessionNumber)`
- **Input**: Dòng bắt đầu, dòng kết thúc, số buổi
- **Logic**:
  - Tìm cột "Buổi N" trong sheet
  - Lọc các ô có giá trị "X" và màu `#6aa84f`
  - Sắp xếp theo tên
  - Tạo công thức động để lookup lại
- **Output**: Ghi vào sheet "BaoCao" với công thức XLOOKUP

### 3. DashboardLogic.js

**Chức năng**: Tính toán và hiển thị Streak điểm danh

**Các hàm chính:**

#### `calculateStreak(attendance)`
- **Input**: Array các giá trị điểm danh
- **Logic**:
  - X, B, M → coi là đi học
  - P → coi là nghỉ
  - Giá trị khác → bỏ qua
- **Return**: `{currentStreak, maxAttendStreak, maxAbsenceStreak}`

#### `getStreakData(monthFilter, buoiFilter)`
- **Input**: Lọc theo tháng/buổi (optional)
- **Logic**:
  - Đọc sheet "Gộp_Nối_Tiếp"
  - Parse metadata từ format "Tháng X||Buổi Y||X"
  - Tính streak cho từng học sinh
- **Return**: `{students, months, buois}`

#### `createStreakDashboard()`
- **Tạo 4 phần**:
  1. Leaderboard (Top 20 streak dương)
  2. Danh sách đầy đủ
  3. Thống kê theo lớp
  4. Cảnh báo (streak âm hoặc nghỉ nhiều)

#### `getStreakDataForWeb(monthFilter, buoiFilter)`
- **API endpoint** cho Dashboard Web
- **Return**: JSON với students, leaderboard, classes, warnings

### 4. JoinLogic.js

**Chức năng**: Gộp dữ liệu từ nhiều sheet "Tháng" thành một sheet tổng hợp

**Các hàm chính:**

#### `processJoinSheets(selectedSheets)`
- **Input**: Array tên các sheet cần gộp
- **Logic**:
  - Tự động phát hiện cột "Buổi"
  - Group theo Mã HV
  - Dồn buổi theo thời gian, chuẩn hóa Tháng (M.YYYY) và Điểm danh (chỉ M/B/X/P)
- **Output**: Sheet "Gộp_Nối_Tiếp" (7 cột: Mã HV, Họ tên, Tên, Lớp, Tháng, Buổi, Điểm danh)

#### `autoJoinAllMonthlySheets()`
- **Tự động gộp** tất cả sheet có tên chứa "Tháng"
- **Cache**: Chỉ chạy lại sau 10 giây

#### `setupAutoJoinTrigger()`
- **Thiết lập trigger** tự động chạy khi có edit
- **Sử dụng**: Installable trigger `onEditTrigger`

### 5. Menu.js, Config.js, Dialogs.js (Main Entry)

**Chức năng**: Menu chính, báo cáo, AI trợ lý

**Các phần chính:**

#### Menu "👉 Báo cáo Tháng"
1. Tạo báo cáo tổng hợp (Gửi PH)
2. Tìm HS vi phạm (BTVN/Ý thức)
3. Cảnh báo Điểm danh
4. Danh sách Học Bù
5. Danh sách HS nhận xét
6. Gộp dữ liệu nhiều tháng
7. Phân tích Streak
8. Dashboard Streak

#### Menu "📅 Báo cáo Buổi"
1. Kéo điểm danh sang BaoCao
2. Kéo nhận xét Azota
3. AI Tạo Đáp Án & Báo Cáo

#### Các hàm báo cáo:

##### `generateRangeReport(startStr, endStr)`
- **Tạo báo cáo** theo khoảng thời gian
- **Tính**: Điểm TB, lỗi BTVN/Ý thức, chi tiết
- **Output**: Sheet "Báo Cáo Tổng Hợp"

##### `scanAtRiskStudents(startDateStr, endDateStr, limitBTVN, limitAtt)`
- **Quét học sinh vi phạm** vượt ngưỡng
- **Output**: Sheet "⚠️ Cảnh Báo Vi Phạm"

##### `generateMakeupList()`
- **Tạo danh sách học bù**
- **Output**: Sheet "📉 Danh Sách Học Bù"

##### `processAiTasks(fileId)`
- **AI trợ lý** tạo đáp án và báo cáo
- **Sử dụng**: Gemini API
- **Input**: File ID (Google Drive) + danh sách học sinh
- **Output**: Sheet "Kết quả AI HH:mm"

---

## 💾 DỮ LIỆU & NGUỒN DỮ LIỆU

### Sheets trong Spreadsheet chính

#### 1. **BaoCao**
- **Mục đích**: Sheet chính lưu báo cáo hàng ngày
- **Cấu trúc** (ước tính):
  - Cột A: Ngày
  - Cột B: Session ID (T01.2025-B6)
  - Cột C: Công thức XLOOKUP
  - Cột D: Mã HV
  - Cột E: Họ tên
  - Cột F: Tên
  - Cột G: Lớp
  - Cột H: Điểm số
  - Cột I: Kết quả/Nhận xét
  - Cột J: Chép phạt

#### 2. **Gộp_Nối_Tiếp**
- **Mục đích**: Sheet tổng hợp điểm danh từ nhiều tháng (dạng long: 1 dòng = 1 record điểm danh)
- **Cấu trúc** (7 cột):
  - Cột A: Mã HV
  - Cột B: Họ tên
  - Cột C: Tên
  - Cột D: Lớp
  - Cột E: Tháng (dạng M.YYYY, ví dụ 6.2025)
  - Cột F: Buổi (số thứ tự buổi)
  - Cột G: Điểm danh (M / B / X / P)
- **Ý nghĩa Điểm danh**: M = học sinh mới (không tính tiền buổi), B = học bù, X = có đi học, P = nghỉ học
- **Đồng bộ**: Thêm/sửa/xóa trên các sheet Tháng được phản ánh lên Gộp qua trigger onEdit -> autoJoinAllMonthlySheets -> processJoinSheets (rebuild từ đầu)

#### 3. **Tháng X.YYYY** (nhiều sheets)
- **Mục đích**: Điểm danh theo tháng
- **Cấu trúc**:
  - Cột A: Mã HV
  - Cột B: Họ tên
  - Cột C: Tên
  - Cột D: Lớp
  - Cột E-N: Buổi 1, Buổi 2, ... Buổi 10
  - Giá trị: X (đi), P (nghỉ), B (bù), M (mới)

#### 4. **Dashboard_Streak**
- **Mục đích**: Dashboard streak (tự động tạo)
- **Gồm**: Leaderboard, Danh sách đầy đủ, Thống kê lớp, Cảnh báo

### External Google Sheet

**ID**: `1D0JR4CNSGdCqelFQwYpVdjP8DkJkRUqoKPdUVnIs1lo`

#### Sheets trong External:
1. **Danh sách Bài**
   - Cột H (Format): Mã Format (ví dụ: "T01.2025-B6")
   - Cột J (Link Kết quả): URL Azota (extract hashid)

2. **Tổng hợp HS**
   - Cột Y: 3 số cuối mã HV
   - Cột K: Mã HV đầy đủ (dùng để match)

3. **Tổng hợp BTVN**
   - Cột D: Hashid
   - Cột E: Mã HV
   - Cột H: Điểm số

### Data Flow

```
External Sheet (Azota)
    ↓
BTVNLogic.js
    ↓
Sheet "BaoCao"
    ↓
Các báo cáo (generateRangeReport, scanAtRiskStudents...)
```

```
Sheets "Tháng X.YYYY"
    ↓
JoinLogic.js
    ↓
Sheet "Gộp_Nối_Tiếp"
    ↓
DashboardLogic.js
    ↓
Dashboard_Streak (Sheet hoặc Web)
```

---

## 🚀 ĐỀ XUẤT CẢI THIỆN & MỞ RỘNG

### 🔴 Ưu tiên cao (Critical)

#### 1. **Cải thiện xử lý lỗi & Logging**
- **Vấn đề**: Một số hàm thiếu error handling đầy đủ
- **Đề xuất**:
  - Thêm try-catch cho tất cả hàm chính
  - Tạo hệ thống logging tập trung (thay vì Logger.log rải rác)
  - Thêm notification cho user khi có lỗi

#### 2. **Tối ưu hiệu năng**
- **Vấn đề**: 
  - `processJoinSheets` có thể chậm với nhiều sheet
  - `matchAndGetScores` duyệt toàn bộ sheet mỗi lần
- **Đề xuất**:
  - Cache dữ liệu external sheet
  - Sử dụng batch operations (setValues thay vì setValue từng ô)
  - Thêm progress indicator cho các thao tác dài

#### 3. **Cấu hình hóa External Sheet ID**
- **Vấn đề**: Hardcode Sheet ID trong code
- **Đề xuất**:
  - Lưu vào PropertiesService hoặc Config sheet
  - Cho phép user thay đổi qua UI

### 🟡 Ưu tiên trung bình (Important)

#### 4. **Cải thiện UI/UX**
- **Đề xuất**:
  - Thêm loading spinner cho các dialog
  - Cải thiện thông báo lỗi (dễ hiểu hơn)
  - Thêm preview trước khi ghi dữ liệu

#### 5. **Validation & Data Quality**
- **Đề xuất**:
  - Validate dữ liệu đầu vào (mã HV format, ngày tháng...)
  - Kiểm tra dữ liệu trùng lặp
  - Cảnh báo khi dữ liệu không khớp

#### 6. **Tài liệu hóa API**
- **Đề xuất**:
  - Tạo JSDoc cho tất cả hàm
  - Document các format dữ liệu
  - Tạo user guide

### 🟢 Ưu tiên thấp (Nice to have)

#### 7. **Tính năng mới**

##### a. **Export/Import dữ liệu**
- Export báo cáo ra PDF/Excel
- Import danh sách học sinh từ file

##### b. **Thống kê nâng cao**
- Biểu đồ xu hướng điểm danh theo thời gian
- So sánh giữa các lớp
- Dự đoán học sinh có nguy cơ nghỉ (ML)

##### c. **Tích hợp thêm**
- Tích hợp với hệ thống SMS (gửi thông báo PH)
- Tích hợp với Google Classroom
- Webhook để cập nhật real-time

##### d. **Multi-user support**
- Phân quyền (admin, giáo viên, xem)
- Lịch sử thay đổi (audit log)

##### e. **Mobile app / PWA**
- Ứng dụng mobile để điểm danh nhanh
- Push notification

#### 8. **Refactoring**

##### a. **Tách code thành modules rõ ràng hơn**
```
Current:
- Đã tách logic cũ Mã.js vào Menu.js, Config.js, Dialogs.js, reports/, ai/, warnings/, details/

Proposed:
- Menu.js (menu setup)
- ReportGenerator.js (các hàm báo cáo)
- AiAssistant.js (AI logic)
- Config.js (cấu hình)
```

##### b. **Sử dụng TypeScript hoặc JSDoc types**
- Thêm type checking
- IDE support tốt hơn

##### c. **Unit tests**
- Tạo test cho các hàm quan trọng
- Sử dụng QUnit (Apps Script testing framework)

#### 9. **Security & Best Practices**

##### a. **API Key Management**
- **Vấn đề**: API key hardcode trong code
- **Đề xuất**: 
  - Lưu vào PropertiesService
  - Hoặc sử dụng Secret Manager (nếu có)

##### b. **Input sanitization**
- Validate và sanitize tất cả input từ user
- Tránh injection attacks

##### c. **Rate limiting**
- Thêm rate limiting cho AI API calls
- Retry logic với exponential backoff

### 📊 Roadmap đề xuất

#### Phase 1 (1-2 tuần): Stability
- ✅ Cải thiện error handling
- ✅ Tối ưu hiệu năng cơ bản
- ✅ Cấu hình hóa External Sheet ID

#### Phase 2 (2-3 tuần): UX & Documentation
- ✅ Cải thiện UI/UX
- ✅ Validation & Data Quality
- ✅ Tài liệu hóa API

#### Phase 3 (1-2 tháng): Features
- ✅ Export/Import
- ✅ Thống kê nâng cao
- ✅ Tích hợp SMS/Notification

#### Phase 4 (2-3 tháng): Scale
- ✅ Multi-user support
- ✅ Mobile app
- ✅ Refactoring lớn

---

## 🔧 HƯỚNG DẪN PHÁT TRIỂN

### Setup môi trường

1. **Clone repository**
```bash
git clone <repo-url>
cd GGsheetDiemDanh
```

2. **Cài đặt Clasp** (nếu chưa có)
```bash
npm install -g @google/clasp
```

3. **Login Clasp**
```bash
clasp login
```

4. **Link với project**
```bash
clasp push
```

### Cấu trúc code mới

Khi thêm tính năng mới:

1. **Tạo file mới** (nếu cần) hoặc thêm vào file hiện có
2. **Thêm menu item** trong `onOpen()` (gs/Menu.js)
3. **Tạo dialog HTML** (nếu cần UI)
4. **Test** trên Google Sheets
5. **Deploy** bằng `clasp push`

### Best Practices

1. **Naming convention**:
   - Hàm: `camelCase`
   - Constants: `UPPER_SNAKE_CASE`
   - Sheet names: Giữ nguyên format hiện tại

2. **Error handling**:
   ```javascript
   try {
     // code
   } catch (error) {
     Logger.log("Error: " + error.toString());
     SpreadsheetApp.getUi().alert("Lỗi: " + error.message);
   }
   ```

3. **Logging**:
   - Sử dụng prefix: `[MODULE_NAME]` để dễ filter
   - Log cả input và output cho hàm quan trọng

4. **Performance**:
   - Batch operations: `setValues()` thay vì `setValue()` nhiều lần
   - Cache dữ liệu khi có thể
   - Tránh duyệt sheet nhiều lần

---

## 📝 GHI CHÚ QUAN TRỌNG

### Dependencies
- **External Sheet ID**: `1D0JR4CNSGdCqelFQwYpVdjP8DkJkRUqoKPdUVnIs1lo`
  - Cần quyền truy cập để hệ thống hoạt động
- **Gemini API Key**: Cần cấu hình trong `gs/Config.js`
- **Google Drive**: Cần quyền để đọc file (AI feature)

### Limitations
1. **Apps Script Quotas**:
   - Execution time: 6 phút max
   - API calls: Có giới hạn
   - Memory: Giới hạn

2. **Google Sheets**:
   - Max 10 triệu cells
   - Max 200 sheets per spreadsheet

3. **External API**:
   - Gemini API có rate limit
   - Cần xử lý rate limiting

### Known Issues
1. **Auto-join trigger**: Có thể chạy nhiều lần nếu edit nhanh (đã có cache nhưng chưa hoàn hảo)
2. **Column mapping**: Một số sheet có thể không tìm thấy cột nếu format khác
3. **AI API**: Có thể timeout với file lớn

---

## 📞 LIÊN HỆ & HỖ TRỢ

- **Repository**: (nếu có)
- **Documentation**: File này
- **Issues**: (nếu có issue tracker)

---

**Cập nhật lần cuối**: 2026-01-26
**Version**: 1.0
**Author**: Documentation generated by AI Assistant
