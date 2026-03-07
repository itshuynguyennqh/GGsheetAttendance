# 🚀 QUICK REFERENCE - HỆ THỐNG QUẢN LÝ ĐIỂM DANH & BTVN

## 📋 TÓM TẮT NHANH

### Các file chính
- **gs/Menu.js, Config.js, Dialogs.js**: Menu, báo cáo, AI (entry point)
- **BTVNLogic.js**: Xử lý BTVN Azota
- **AttendanceLogic.js**: Xuất điểm danh
- **DashboardLogic.js**: Tính toán Streak
- **JoinLogic.js**: Gộp dữ liệu nhiều tháng

### Sheets quan trọng
- **BaoCao**: Sheet chính lưu báo cáo hàng ngày
- **Gộp_Nối_Tiếp**: Tổng hợp điểm danh từ nhiều tháng
- **Tháng X.YYYY**: Điểm danh theo tháng
- **External Sheet** (ID: `1D0JR4CNSGdCqelFQwYpVdjP8DkJkRUqoKPdUVnIs1lo`): Dữ liệu Azota

---

## 🎯 CÁC CHỨC NĂNG CHÍNH

### Menu "👉 Báo cáo Tháng"
| Chức năng | Hàm | Mô tả |
|-----------|-----|-------|
| Tạo báo cáo tổng hợp | `generateRangeReport()` | Báo cáo gửi PH theo khoảng thời gian |
| Tìm HS vi phạm | `scanAtRiskStudents()` | Quét học sinh thiếu BTVN/ý thức kém |
| Cảnh báo Điểm danh | `scanAttendanceWarning()` | Phát hiện học sinh nghỉ nhiều |
| Danh sách Học Bù | `generateMakeupList()` | Liệt kê học sinh cần học bù |
| Danh HS nhận xét | `generateStudentDetails()` | Trích xuất chi tiết nhận xét |
| Gộp dữ liệu | `processJoinSheets()` | Gộp nhiều sheet "Tháng" |
| Phân tích Streak | `analyzeAttendanceStreaks()` | Tính chuỗi đi học/nghỉ |
| Dashboard Streak | `createStreakDashboard()` | Tạo dashboard trên Sheet |

### Menu "📅 Báo cáo Buổi"
| Chức năng | Hàm | Mô tả |
|-----------|-----|-------|
| Kéo điểm danh | `processAttendanceExport()` | Xuất điểm danh sang BaoCao |
| Kéo nhận xét Azota | `processBTVNAzota()` | Lấy điểm BTVN từ Azota |
| AI Tạo Đáp Án | `processAiTasks()` | Tạo đáp án và báo cáo bằng AI |

---

## 🔄 FLOW XỬ LÝ NGẮN GỌN

### BTVN Azota
```
Chọn vùng BaoCao → Tìm hashid → Match học viên → Lấy điểm → Ghi kết quả
```

### Gộp Sheet
```
Chọn sheets "Tháng" → Phát hiện cột "Buổi" → Group theo Mã HV → Dồn buổi → Ghi "Gộp_Nối_Tiếp"
```

### Tính Streak
```
Đọc "Gộp_Nối_Tiếp" → Filter X/P → Tính max streak → Tính current streak → Trả về kết quả
```

### AI Trợ lý
```
Nhập File ID → Chọn danh sách HS → Đọc file Drive → Gọi Gemini API → Xuất kết quả
```

---

## 📊 CẤU TRÚC DỮ LIỆU

### Sheet "BaoCao"
```
A: Ngày | B: Session ID | C: Công thức | D: Mã HV | E: Họ tên | F: Tên | G: Lớp | H: Điểm | I: Kết quả | J: Chép phạt
```

### Sheet "Gộp_Nối_Tiếp"
```
A: Mã HV | B: Họ tên | C: Tên | D: Lớp | E+: B1, B2, B3... (Format: "Tháng X||Buổi Y||X/P")
```

### External Sheet - "Danh sách Bài"
```
H: Format (T01.2025-B6) | J: Link Kết quả (URL Azota)
```

### External Sheet - "Tổng hợp HS"
```
Y: 3 số cuối | K: Mã HV đầy đủ
```

### External Sheet - "Tổng hợp BTVN"
```
D: Hashid | E: Mã HV | H: Điểm số
```

---

## 🔧 CÁC HÀM HELPER QUAN TRỌNG

### Tìm cột tự động
```javascript
findColumnIndex(sheet, columnName, headerRow)
// Tìm cột theo header hoặc tên Excel (A, B, C...)
```

### Tạo column mapping
```javascript
createColumnMapping(sheet, columnConfig, headerRow)
// Tạo object mapping tên -> index
```

### Tính Streak
```javascript
calculateStreak(attendance)
// Return: {currentStreak, maxAttendStreak, maxAbsenceStreak}
```

### Parse ngày
```javascript
parseDate(dateVal)
// Chuyển đổi nhiều format ngày về Date object
```

---

## ⚙️ CẤU HÌNH

### External Sheet ID
```javascript
const externalSheetId = '1D0JR4CNSGdCqelFQwYpVdjP8DkJkRUqoKPdUVnIs1lo';
```

### Gemini API
```javascript
const GEMINI_API_KEY = "";
const GEMINI_MODEL = "gemini-2.0-flash";
```

### Auto-join
- **Cache**: 10 giây
- **Trigger**: Installable trigger `onEditTrigger`
- **Enable/Disable**: `setupAutoJoinTrigger()` / `removeAutoJoinTrigger()`

---

## 🐛 XỬ LÝ LỖI THƯỜNG GẶP

### Lỗi: Không tìm thấy cột
- **Nguyên nhân**: Header không khớp hoặc sheet format khác
- **Giải pháp**: Kiểm tra header, sử dụng `findColumnIndex()` với nhiều tên

### Lỗi: Không truy cập được External Sheet
- **Nguyên nhân**: Chưa có quyền hoặc Sheet ID sai
- **Giải pháp**: Kiểm tra quyền truy cập, verify Sheet ID

### Lỗi: AI API rate limit
- **Nguyên nhân**: Gọi API quá nhiều
- **Giải pháp**: Đợi vài phút, thêm retry logic

### Lỗi: Không tìm thấy hashid
- **Nguyên nhân**: Format không khớp hoặc không có trong "Danh sách Bài"
- **Giải pháp**: Kiểm tra Format trong sheet, verify logic `extractHashids()`

---

## 📈 METRICS & MONITORING

### Cần theo dõi
- Số lượng học sinh xử lý mỗi lần
- Thời gian xử lý (đặc biệt với nhiều sheet)
- Tỷ lệ lỗi (không tìm thấy hashid, không match học viên...)
- Số lần gọi AI API

### Logging
- Sử dụng prefix: `[MODULE_NAME]` để filter
- Log cả input và output cho hàm quan trọng
- Xem log: Extensions → Apps Script → Executions

---

## 🚀 DEPLOYMENT

### Sử dụng Clasp
```bash
# Push code lên Apps Script
clasp push

# Pull code về local
clasp pull

# Deploy Web App (nếu có)
clasp deploy
```

### Manual deployment
1. Mở Extensions → Apps Script
2. Copy code vào editor
3. Save
4. Deploy (nếu cần Web App)

---

## 📝 NOTES

- **Apps Script Quota**: 6 phút execution time max
- **Batch operations**: Luôn dùng `setValues()` thay vì `setValue()` nhiều lần
- **Cache**: Sử dụng `CacheService` cho dữ liệu ít thay đổi
- **Error handling**: Luôn có try-catch cho hàm chính

---

**Version**: 1.0  
**Last Updated**: 2026-01-26
