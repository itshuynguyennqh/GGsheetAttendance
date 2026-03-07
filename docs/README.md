# 📚 HỆ THỐNG QUẢN LÝ ĐIỂM DANH & BTVN

Hệ thống quản lý điểm danh và bài tập về nhà (BTVN) cho trung tâm giáo dục, được xây dựng trên **Google Apps Script** và tích hợp với **Google Sheets**.

## 🚀 BẮT ĐẦU NHANH

### Yêu cầu
- Google Account
- Google Sheets với quyền chỉnh sửa
- Quyền truy cập External Google Sheet (Azota data)

### Cài đặt

1. **Clone hoặc tải code về**
```bash
git clone <repo-url>
cd GGsheetDiemDanh
```

2. **Cài đặt Clasp** (tùy chọn, để deploy)
```bash
npm install -g @google/clasp
clasp login
```

3. **Deploy lên Google Apps Script**
   - Mở Google Sheets
   - Extensions → Apps Script
   - Copy code từ các file `.js` vào editor
   - Save project

4. **Cấu hình**
   - Cập nhật `GEMINI_API_KEY` trong `gs/Config.js` (nếu dùng AI feature)
   - Kiểm tra External Sheet ID trong `BTVNLogic.js`

5. **Chạy lần đầu**
   - Chạy hàm `onOpen()` để tạo menu
   - Refresh Google Sheets

## 📖 TÀI LIỆU

- **[DOCUMENTATION.md](./DOCUMENTATION.md)**: Tài liệu chi tiết đầy đủ
- **[QUICK_REFERENCE.md](./QUICK_REFERENCE.md)**: Tham khảo nhanh
- **[ARCHITECTURE.md](./ARCHITECTURE.md)**: Kiến trúc và sơ đồ flow
- **[API_DOCUMENTATION.md](./API_DOCUMENTATION.md)**: 📡 Tài liệu API với try out
- **[API_SETUP.md](./API_SETUP.md)**: 🔧 Hướng dẫn setup API
- **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)**: 🚀 Hướng dẫn deployment (không conflict)
- **[SWAGGER_SETUP.md](./SWAGGER_SETUP.md)**: 📚 Hướng dẫn Swagger UI

## 🎯 CÁC TÍNH NĂNG CHÍNH

### 📅 Báo cáo Tháng
- ✅ Tạo báo cáo tổng hợp gửi phụ huynh
- ✅ Tìm học sinh vi phạm (BTVN/Ý thức)
- ✅ Cảnh báo điểm danh (nghỉ nhiều)
- ✅ Danh sách học bù
- ✅ Danh sách học sinh nhận xét
- ✅ Gộp dữ liệu nhiều tháng
- ✅ Phân tích Streak (chuỗi đi học/nghỉ)
- ✅ Dashboard Streak

### 📝 Báo cáo Buổi
- ✅ Kéo điểm danh sang BaoCao
- ✅ Kéo nhận xét Azota (tự động lấy điểm BTVN)
- ✅ AI Tạo Đáp Án & Báo Cáo

## 📁 CẤU TRÚC CODEBASE

```
GGsheetDiemDanh/
├── gs/                       # Apps Script (clasp rootDir)
│   ├── Config.js             # GEMINI_API_KEY, cấu hình
│   ├── Menu.js               # onOpen() - Menu chính
│   ├── Dialogs.js            # Các dialog
│   ├── core/                 # Helpers, CommentAnalysis
│   ├── reports/              # ReportGeneration, MessageTemplates
│   ├── btvn/                 # BTVNLogic, BTVNAzotaExternal
│   ├── join/JoinLogic.js     # Gộp dữ liệu nhiều tháng
│   ├── attendance/           # AttendanceLogic
│   ├── dashboard/            # DashboardLogic, DashboardMenu
│   ├── warnings/             # Cảnh báo vi phạm
│   ├── details/DetailDialog.js
│   ├── ai/GeminiService.js   # AI trợ lý
│   └── *.html                # JoinDialog, AttendanceDialog, Dashboard...
├── .clasp.json
└── package.json
```

## 🔧 SỬ DỤNG

### Menu chính
Sau khi cài đặt, menu sẽ xuất hiện trong Google Sheets:
- **👉 Báo cáo Tháng**: Các tính năng báo cáo theo tháng
- **📅 Báo cáo Buổi**: Các tính năng báo cáo theo buổi

### 🌐 API

Hệ thống cung cấp REST API để lấy dữ liệu Streak:

- **Tài liệu API**: [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)
- **Hướng dẫn setup**: [API_SETUP.md](./API_SETUP.md)
- **Swagger UI**: Mở file `swagger-ui.html` để xem và test API (giống Swagger)
- **OpenAPI Spec**: [openapi.yaml](./openapi.yaml) - Chuẩn OpenAPI 3.0.3
- **Test API đơn giản**: Mở file `api-tester.html` trong browser

**Ví dụ nhanh:**
```bash
# Lấy tất cả dữ liệu Streak
curl "https://script.google.com/macros/s/{SCRIPT_ID}/exec?endpoint=getStreakData"

# Lọc theo tháng
curl "https://script.google.com/macros/s/{SCRIPT_ID}/exec?endpoint=getStreakData&month=6.2025"
```

**Swagger UI:**
1. Mở `swagger-ui.html` trong browser
2. Click "⚙️ Cập nhật Script ID" để nhập Script ID
3. Test API trực tiếp trong Swagger UI

### Ví dụ sử dụng

#### 1. Kéo điểm BTVN từ Azota
1. Mở sheet "BaoCao"
2. Chọn vùng dữ liệu (dòng đầu có Format/Mã BTVN, các dòng sau có Mã HV)
3. Menu → 📅 Báo cáo Buổi → 📝 Kéo nhận xét Azota
4. Kết quả sẽ được ghi vào cột "Kết quả"

#### 2. Gộp dữ liệu nhiều tháng
1. Menu → 👉 Báo cáo Tháng → 🔗 Gộp (Join) dữ liệu nhiều tháng
2. Chọn các sheet "Tháng X.YYYY" cần gộp
3. Kết quả sẽ được ghi vào sheet "Gộp_Nối_Tiếp"

#### 3. Tạo Dashboard Streak
1. Menu → 👉 Báo cáo Tháng → 📊 Tạo Dashboard Streak
2. Dashboard sẽ được tạo trong sheet "Dashboard_Streak"

## ⚙️ CẤU HÌNH

### External Sheet ID
File: `BTVNLogic.js`
```javascript
const externalSheetId = '1D0JR4CNSGdCqelFQwYpVdjP8DkJkRUqoKPdUVnIs1lo';
```

### Gemini API Key
File: `gs/Config.js`
```javascript
const GEMINI_API_KEY = "YOUR_API_KEY_HERE";
const GEMINI_MODEL = "gemini-2.0-flash";
```

## 🐛 XỬ LÝ LỖI

### Lỗi thường gặp

1. **Không tìm thấy sheet**
   - Kiểm tra tên sheet có đúng không
   - Đảm bảo sheet tồn tại

2. **Không truy cập được External Sheet**
   - Kiểm tra quyền truy cập
   - Verify Sheet ID

3. **AI API lỗi**
   - Kiểm tra API key
   - Kiểm tra rate limit
   - Xem Logger để biết chi tiết

Xem thêm trong [QUICK_REFERENCE.md](./QUICK_REFERENCE.md#-xử-lý-lỗi-thường-gặp)

## 📊 SHEETS QUAN TRỌNG

- **BaoCao**: Sheet chính lưu báo cáo hàng ngày
- **Gộp_Nối_Tiếp**: Tổng hợp điểm danh từ nhiều tháng
- **Tháng X.YYYY**: Điểm danh theo tháng
- **Dashboard_Streak**: Dashboard streak (tự động tạo)

## 🔄 WORKFLOW ĐIỂN HÌNH

```
1. Nhập điểm danh vào sheet "Tháng X.YYYY"
   ↓
2. Gộp dữ liệu (tự động hoặc thủ công)
   ↓
3. Tạo Dashboard Streak
   ↓
4. Kéo điểm BTVN từ Azota (nếu có)
   ↓
5. Tạo báo cáo tổng hợp
   ↓
6. Gửi báo cáo cho phụ huynh
```

## 🚀 PHÁT TRIỂN

### Thêm tính năng mới

1. Tạo hàm mới trong file phù hợp
2. Thêm menu item trong `onOpen()` (gs/Menu.js)
3. Tạo dialog HTML (nếu cần UI)
4. Test trên Google Sheets
5. Deploy bằng `clasp push`

Xem thêm trong [DOCUMENTATION.md](./DOCUMENTATION.md#-hướng-dẫn-phát-triển)

## 📈 ROADMAP

### Phase 1: Stability (1-2 tuần)
- ✅ Cải thiện error handling
- ✅ Tối ưu hiệu năng
- ✅ Cấu hình hóa External Sheet ID

### Phase 2: UX & Documentation (2-3 tuần)
- ✅ Cải thiện UI/UX
- ✅ Validation & Data Quality
- ✅ Tài liệu hóa API

### Phase 3: Features (1-2 tháng)
- ✅ Export/Import
- ✅ Thống kê nâng cao
- ✅ Tích hợp SMS/Notification

Xem chi tiết trong [DOCUMENTATION.md](./DOCUMENTATION.md#-roadmap-đề-xuất)

## 🤝 ĐÓNG GÓP

1. Fork repository
2. Tạo feature branch
3. Commit changes
4. Push to branch
5. Tạo Pull Request

## 📝 LICENSE

[Thêm license nếu có]

## 📞 LIÊN HỆ

- **Issues**: [Tạo issue trên GitHub]
- **Documentation**: Xem các file `.md` trong repo

---

**Version**: 1.0  
**Last Updated**: 2026-01-26  
**Maintained by**: [Tên người maintain]
