# 🔧 HƯỚNG DẪN SETUP API

Hướng dẫn chi tiết để setup và sử dụng API của hệ thống.

## 📋 Bước 1: Deploy Web App

### 1.1. Mở Apps Script Editor

1. Mở Google Sheets của bạn
2. Vào **Extensions** → **Apps Script**
3. Apps Script Editor sẽ mở

### 1.2. Đảm bảo code đã được cập nhật

Code trong `DashboardLogic.js` phải có hàm `doGet(e)` với hỗ trợ query parameters:

```javascript
function doGet(e) {
  // Kiểm tra nếu có parameter endpoint=getStreakData
  if (e && e.parameter && e.parameter.endpoint === 'getStreakData') {
    const month = e.parameter.month || null;
    const buoi = e.parameter.buoi ? parseInt(e.parameter.buoi, 10) : null;
    
    try {
      const data = getStreakDataForWeb(month, buoi);
      return ContentService.createTextOutput(JSON.stringify(data))
        .setMimeType(ContentService.MimeType.JSON)
        .setHeader('Access-Control-Allow-Origin', '*')
        .setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
        .setHeader('Access-Control-Allow-Headers', 'Content-Type');
    } catch (error) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: error.toString(),
        timestamp: new Date().toISOString()
      }))
        .setMimeType(ContentService.MimeType.JSON)
        .setHeader('Access-Control-Allow-Origin', '*');
    }
  }
  
  // Mặc định trả về Dashboard HTML
  return HtmlService.createTemplateFromFile('Dashboard')
    .evaluate()
    .setTitle('Dashboard Streak Điểm Danh')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
```

### 1.3. Deploy Web App

1. Trong Apps Script Editor, click **Deploy** → **New deployment**
2. Chọn **Select type** → **Web app**
3. Cấu hình:
   - **Description**: "API & Dashboard Web App" (tùy chọn)
   - **Execute as**: **Me** (tài khoản của bạn)
   - **Who has access**: 
     - **Anyone** (không cần đăng nhập) - Khuyến nghị cho API
     - Hoặc **Anyone with Google account** (cần đăng nhập Google)
4. Click **Deploy**
5. **Lần đầu tiên**: Google sẽ yêu cầu authorize
   - Click **Authorize access**
   - Chọn tài khoản Google
   - Click **Advanced** → **Go to [Project Name] (unsafe)**
   - Click **Allow**
6. Copy **Web app URL** (dạng: `https://script.google.com/macros/s/{SCRIPT_ID}/exec`)

### 1.4. Lấy Script ID

1. Trong Apps Script Editor, click **Project Settings** (⚙️ icon)
2. Tìm **Script ID**
3. Copy Script ID này

---

## 📋 Bước 2: Test API

### 2.1. Sử dụng API Tester (Khuyến nghị)

1. Mở file `api-tester.html` trong browser
2. Nhập Script ID vào ô "Script ID"
3. Chọn endpoint muốn test
4. Điền parameters (nếu có)
5. Click **Gửi Request**
6. Xem kết quả

### 2.2. Test bằng Browser

Mở URL này trong browser (thay `{SCRIPT_ID}` bằng Script ID của bạn):

```
https://script.google.com/macros/s/{SCRIPT_ID}/exec?endpoint=getStreakData
```

### 2.3. Test bằng curl

```bash
curl "https://script.google.com/macros/s/{SCRIPT_ID}/exec?endpoint=getStreakData&month=6.2025"
```

### 2.4. Test bằng JavaScript

```javascript
fetch('https://script.google.com/macros/s/{SCRIPT_ID}/exec?endpoint=getStreakData&month=6.2025')
  .then(response => response.json())
  .then(data => {
    console.log('Success:', data);
  })
  .catch(error => {
    console.error('Error:', error);
  });
```

---

## 🔒 Bước 3: Cấu hình CORS (nếu cần)

Nếu gặp lỗi CORS khi gọi từ browser:

### Giải pháp 1: Thêm CORS headers (đã có trong code)

Code đã có headers:
```javascript
.setHeader('Access-Control-Allow-Origin', '*')
.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
.setHeader('Access-Control-Allow-Headers', 'Content-Type')
```

### Giải pháp 2: Sử dụng CORS proxy

Nếu vẫn lỗi, có thể dùng CORS proxy:
```
https://cors-anywhere.herokuapp.com/https://script.google.com/macros/s/{SCRIPT_ID}/exec?endpoint=getStreakData
```

### Giải pháp 3: Gọi từ server-side

Gọi API từ server (Node.js, Python...) thay vì browser để tránh CORS.

---

## ⚠️ Troubleshooting

### Lỗi: "Script function not found: doGet"

**Nguyên nhân**: Hàm `doGet()` không tồn tại hoặc có lỗi syntax.

**Giải pháp**:
1. Kiểm tra code trong `DashboardLogic.js`
2. Đảm bảo hàm `doGet(e)` tồn tại
3. Save và deploy lại

### Lỗi: "Access denied" hoặc "Authorization required"

**Nguyên nhân**: Chưa authorize hoặc chọn "Anyone with Google account".

**Giải pháp**:
1. Deploy lại với "Who has access" = "Anyone"
2. Hoặc đăng nhập Google trước khi gọi API

### Lỗi: "Sheet not found: Gộp_Nối_Tiếp"

**Nguyên nhân**: Sheet "Gộp_Nối_Tiếp" chưa được tạo.

**Giải pháp**:
1. Chạy hàm `manualJoinAllMonthlySheets()` để tạo sheet
2. Hoặc tạo sheet thủ công với tên "Gộp_Nối_Tiếp"

### Lỗi: CORS error trong browser

**Nguyên nhân**: Browser chặn cross-origin request.

**Giải pháp**:
1. Kiểm tra headers CORS đã được set chưa
2. Thử dùng CORS proxy
3. Hoặc gọi từ server-side

### Response trả về HTML thay vì JSON

**Nguyên nhân**: Parameter `endpoint=getStreakData` không được truyền đúng.

**Giải pháp**:
1. Kiểm tra URL có đúng format không
2. Đảm bảo parameter `endpoint=getStreakData` có trong URL
3. Kiểm tra code `doGet(e)` có xử lý parameter không

---

## 📊 Ví dụ sử dụng

### Ví dụ 1: Lấy tất cả dữ liệu

```javascript
const url = 'https://script.google.com/macros/s/{SCRIPT_ID}/exec?endpoint=getStreakData';
fetch(url)
  .then(res => res.json())
  .then(data => {
    console.log('Total students:', data.stats.totalStudents);
    console.log('Leaderboard:', data.leaderboard);
  });
```

### Ví dụ 2: Lọc theo tháng

```javascript
const url = 'https://script.google.com/macros/s/{SCRIPT_ID}/exec?endpoint=getStreakData&month=6.2025';
fetch(url)
  .then(res => res.json())
  .then(data => {
    console.log('Students in June 2025:', data.students);
  });
```

### Ví dụ 3: Lọc theo tháng và buổi

```javascript
const url = 'https://script.google.com/macros/s/{SCRIPT_ID}/exec?endpoint=getStreakData&month=6.2025&buoi=2';
fetch(url)
  .then(res => res.json())
  .then(data => {
    console.log('Students in June 2025, Session 2:', data.students);
  });
```

### Ví dụ 4: Hiển thị Dashboard

```html
<iframe 
  src="https://script.google.com/macros/s/{SCRIPT_ID}/exec"
  width="100%" 
  height="800px"
  frameborder="0">
</iframe>
```

---

## 🔄 Update Deployment

Khi code thay đổi:

1. **Save** code trong Apps Script Editor
2. **Deploy** → **Manage deployments**
3. Click **Edit** (✏️ icon) bên cạnh deployment
4. Chọn **New version** hoặc **Version: Head**
5. Click **Deploy**
6. **Lưu ý**: URL không đổi, nhưng code đã được cập nhật

---

## 📝 Best Practices

1. **Script ID**: Lưu Script ID ở nơi an toàn, không commit vào public repo
2. **Permissions**: Chọn "Anyone" chỉ khi cần public API
3. **Error Handling**: Luôn kiểm tra `success: false` trong response
4. **Rate Limiting**: Không gọi API quá nhiều lần trong thời gian ngắn
5. **Caching**: Cache response ở client nếu có thể

---

## 🔗 Links hữu ích

- [Google Apps Script Web Apps](https://developers.google.com/apps-script/guides/web)
- [ContentService Documentation](https://developers.google.com/apps-script/reference/content/content-service)
- [CORS Guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)

---

**Version**: 1.0  
**Last Updated**: 2026-01-26
