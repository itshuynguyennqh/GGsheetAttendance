# 📡 API DOCUMENTATION

Tài liệu API cho Hệ thống Quản lý Điểm Danh & BTVN.

## 🌐 Base URL

Sau khi deploy Web App, bạn sẽ có URL dạng:
```
https://script.google.com/macros/s/{SCRIPT_ID}/exec
```

**Lưu ý**: Thay `{SCRIPT_ID}` bằng Script ID của bạn (lấy từ Apps Script Editor → Project Settings).

---

## 📋 Endpoints

### 1. GET `/exec` - Dashboard Web (HTML)

Trả về giao diện Dashboard Streak dạng HTML.

**Request:**
```http
GET /exec
```

**Response:**
- **Content-Type**: `text/html`
- **Body**: HTML page với Dashboard Streak

**Example:**
```bash
curl "https://script.google.com/macros/s/{SCRIPT_ID}/exec"
```

---

### 2. GET `/exec?endpoint=getStreakData` - Lấy dữ liệu Streak (JSON)

Trả về dữ liệu Streak dạng JSON.

**Request:**
```http
GET /exec?endpoint=getStreakData&month={month}&buoi={buoi}
```

**Query Parameters:**

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `endpoint` | string | Yes | Phải là `"getStreakData"` | `getStreakData` |
| `month` | string | No | Lọc theo tháng (format: "6.2025") | `6.2025` |
| `buoi` | number | No | Lọc theo buổi (1, 2, 3...) | `2` |

**Response:**

**Success (200 OK):**
```json
{
  "success": true,
  "timestamp": "2026-01-26T10:30:00.000Z",
  "students": [
    {
      "maHV": "HV-0000164",
      "hoTen": "Nguyễn Văn A",
      "ten": "A",
      "lop": "Lớp 6A",
      "currentStreak": 5,
      "maxAttendStreak": 10,
      "maxAbsenceStreak": 2,
      "maxAttendance": 10,
      "maxAbsence": 2,
      "totalSessions": 25
    }
  ],
  "leaderboard": [
    {
      "rank": 1,
      "maHV": "HV-0000164",
      "hoTen": "Nguyễn Văn A",
      "ten": "A",
      "lop": "Lớp 6A",
      "currentStreak": 15,
      "maxAttendStreak": 15,
      "maxAbsenceStreak": 0
    }
  ],
  "classes": [
    {
      "className": "Lớp 6A",
      "total": 30,
      "positiveStreak": 25,
      "negativeStreak": 2,
      "avgStreak": 8.5,
      "sumStreak": 255
    }
  ],
  "warnings": [
    {
      "maHV": "HV-0000200",
      "hoTen": "Trần Thị B",
      "ten": "B",
      "lop": "Lớp 6B",
      "currentStreak": -3,
      "maxAbsenceStreak": 5,
      "reason": "Đang nghỉ 3 buổi liên tiếp"
    }
  ],
  "stats": {
    "totalStudents": 150,
    "totalClasses": 5,
    "positiveStreakCount": 120,
    "negativeStreakCount": 10,
    "warningCount": 15
  },
  "filterOptions": {
    "months": ["6.2025", "7.2025", "8.2025"],
    "buois": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  },
  "appliedFilters": {
    "month": "6.2025",
    "buoi": null
  }
}
```

**Error (200 OK với success: false):**
```json
{
  "success": false,
  "error": "Không tìm thấy sheet 'Gộp_Nối_Tiếp'! Vui lòng chạy hàm gộp sheet trước.",
  "timestamp": "2026-01-26T10:30:00.000Z"
}
```

**Examples:**

```bash
# Lấy tất cả dữ liệu
curl "https://script.google.com/macros/s/{SCRIPT_ID}/exec?endpoint=getStreakData"

# Lọc theo tháng
curl "https://script.google.com/macros/s/{SCRIPT_ID}/exec?endpoint=getStreakData&month=6.2025"

# Lọc theo tháng và buổi
curl "https://script.google.com/macros/s/{SCRIPT_ID}/exec?endpoint=getStreakData&month=6.2025&buoi=2"
```

---

## 📊 Response Schema

### Student Object

```typescript
interface Student {
  maHV: string;              // Mã học viên (ví dụ: "HV-0000164")
  hoTen: string;             // Họ và tên đầy đủ
  ten: string;               // Tên (không có họ)
  lop: string;               // Lớp (ví dụ: "Lớp 6A")
  currentStreak: number;     // Streak hiện tại (dương = đi học, âm = nghỉ)
  maxAttendStreak: number;   // Chuỗi đi học dài nhất
  maxAbsenceStreak: number;  // Chuỗi nghỉ dài nhất
  maxAttendance: number;     // Alias của maxAttendStreak
  maxAbsence: number;         // Alias của maxAbsenceStreak
  totalSessions: number;      // Tổng số buổi đã điểm danh
}
```

### Leaderboard Item

```typescript
interface LeaderboardItem extends Student {
  rank: number;              // Hạng (1, 2, 3...)
}
```

### Class Statistics

```typescript
interface ClassStats {
  className: string;         // Tên lớp
  total: number;             // Tổng số học sinh
  positiveStreak: number;    // Số học sinh có streak dương
  negativeStreak: number;    // Số học sinh có streak âm
  avgStreak: number;         // Streak trung bình
  sumStreak: number;         // Tổng streak (dùng để tính avg)
}
```

### Warning

```typescript
interface Warning extends Student {
  reason: string;            // Lý do cảnh báo
}
```

### Stats

```typescript
interface Stats {
  totalStudents: number;     // Tổng số học sinh
  totalClasses: number;      // Tổng số lớp
  positiveStreakCount: number; // Số học sinh có streak >= 5
  negativeStreakCount: number; // Số học sinh có streak < 0
  warningCount: number;       // Số học sinh cần cảnh báo
}
```

---

## 🔧 Cách sử dụng API

### 1. Deploy Web App

1. Mở **Apps Script Editor**
2. Chọn **Deploy** → **New deployment**
3. Chọn type: **Web app**
4. Execute as: **Me**
5. Who has access: **Anyone** (hoặc "Anyone with Google account")
6. Click **Deploy**
7. Copy **Web app URL**

### 2. Cập nhật endpoint để nhận query parameters

Hiện tại `getStreakDataAPI()` không nhận parameters. Cần cập nhật:

```javascript
// Thêm vào DashboardLogic.js hoặc tạo endpoint mới
function doGet(e) {
  // Nếu có parameter endpoint=getStreakData
  if (e && e.parameter && e.parameter.endpoint === 'getStreakData') {
    const month = e.parameter.month || null;
    const buoi = e.parameter.buoi ? parseInt(e.parameter.buoi) : null;
    const data = getStreakDataForWeb(month, buoi);
    return ContentService.createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON)
      .setMimeType(ContentService.MimeType.JSON)
      .setHeader('Access-Control-Allow-Origin', '*'); // CORS
  }
  
  // Mặc định trả về Dashboard HTML
  return HtmlService.createTemplateFromFile('Dashboard')
    .evaluate()
    .setTitle('Dashboard Streak Điểm Danh')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
```

### 3. Test API

Sử dụng file `api-tester.html` (xem bên dưới) hoặc:

**JavaScript:**
```javascript
fetch('https://script.google.com/macros/s/{SCRIPT_ID}/exec?endpoint=getStreakData&month=6.2025')
  .then(response => response.json())
  .then(data => console.log(data))
  .catch(error => console.error('Error:', error));
```

**Python:**
```python
import requests

url = "https://script.google.com/macros/s/{SCRIPT_ID}/exec"
params = {
    "endpoint": "getStreakData",
    "month": "6.2025",
    "buoi": 2
}

response = requests.get(url, params=params)
data = response.json()
print(data)
```

---

## ⚠️ Lưu ý

1. **CORS**: Google Apps Script Web App có thể có vấn đề CORS. Nếu gọi từ browser, có thể cần thêm header `Access-Control-Allow-Origin`.

2. **Authentication**: 
   - Nếu chọn "Anyone" → không cần auth
   - Nếu chọn "Anyone with Google account" → cần login Google

3. **Rate Limiting**: 
   - Google Apps Script có quota giới hạn
   - Không nên gọi quá nhiều request trong thời gian ngắn

4. **Error Handling**: 
   - Luôn kiểm tra `success: false` trong response
   - Xem field `error` để biết chi tiết lỗi

5. **Data Format**:
   - `month`: Format "M.YYYY" (ví dụ: "6.2025")
   - `buoi`: Số nguyên (1, 2, 3...)

---

## 🧪 Try It Out

Sử dụng file `api-tester.html` để test API trực tiếp trong browser.

Hoặc sử dụng các công cụ:
- **Postman**: Import collection từ file này
- **curl**: Xem examples ở trên
- **JavaScript fetch**: Xem examples ở trên

---

## 📝 Changelog

### v1.0 (2026-01-26)
- Initial API documentation
- Endpoint: Dashboard HTML
- Endpoint: Get Streak Data (JSON)

---

**Version**: 1.0  
**Last Updated**: 2026-01-26
