# 🚀 HƯỚNG DẪN DEPLOYMENT - KHÔNG CÓ CONFLICT!

## 🖥️ Web thuần – Không dùng App Script deploy

| | **Web (local / deploy tĩnh)** |
|---|------------------------------|
| **Mục đích** | Phát triển và chạy dashboard độc lập |
| **Chạy** | `npm run dev` → http://localhost:3000 |
| **Dữ liệu** | Google Sheet → **Publish to web (CSV)** → `dev/config.js` **CSV_URL** |
| **Logic** | `dev/streak-logic.js` (tính streak từ CSV, không cần App Script) |

- **Không deploy App Script**: Web kéo dữ liệu từ Google Sheet qua link Publish to web (CSV). Cấu hình `dev/config.js` → `CSV_URL`. Chi tiết: [dev/README.md](../dev/README.md).
- App Script (Dashboard.html, DashboardLogic.js, doGet) trong thư mục gốc có thể giữ để dùng trong Sheet (menu, sidebar), không dùng để deploy Web App cho dashboard.

---

## ❓ Câu hỏi: Deploy Web App có conflict với deploy "streak điểm danh" không?

### ✅ **TRẢ LỜI: KHÔNG CÓ CONFLICT!**

## 🔍 Giải thích chi tiết

### 1. Cấu trúc hiện tại

Trong code hiện tại, hàm `doGet(e)` đã được thiết kế để xử lý **CẢ HAI** chức năng:

```javascript
function doGet(e) {
  // Nếu có parameter endpoint=getStreakData → Trả về JSON API
  if (e && e.parameter && e.parameter.endpoint === 'getStreakData') {
    // ... API logic
    return ContentService.createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  // Mặc định → Trả về Dashboard HTML
  return HtmlService.createTemplateFromFile('Dashboard')
    .evaluate()
    .setTitle('Dashboard Streak Điểm Danh');
}
```

### 2. Cách hoạt động

**Cùng một URL, nhưng trả về khác nhau tùy vào parameters:**

| URL | Response |
|-----|----------|
| `https://script.google.com/macros/s/{SCRIPT_ID}/exec` | Dashboard HTML (mặc định) |
| `https://script.google.com/macros/s/{SCRIPT_ID}/exec?endpoint=getStreakData` | JSON API |

### 3. Google Apps Script Deployment

- **Một script project** chỉ có **MỘT hàm `doGet()`**
- **Một deployment** có thể serve nhiều endpoints thông qua parameters
- **KHÔNG CẦN** tạo deployment riêng cho Dashboard và API

---

## 📋 Các tình huống deployment

### Tình huống 1: Chưa có deployment nào (Mới)

**Bước 1**: Deploy Web App lần đầu
- Deploy → New deployment → Web app
- Execute as: Me
- Who has access: Anyone (hoặc Anyone with Google account)
- **Kết quả**: Một URL duy nhất phục vụ cả Dashboard HTML và API JSON

**Sử dụng:**
- Dashboard: `https://script.google.com/macros/s/{SCRIPT_ID}/exec`
- API: `https://script.google.com/macros/s/{SCRIPT_ID}/exec?endpoint=getStreakData`

### Tình huống 2: Đã có deployment Dashboard (Cũ)

**Nếu bạn đã deploy Dashboard trước đó:**

#### Option A: Update deployment hiện có (Khuyến nghị) ✅

1. **Deploy** → **Manage deployments**
2. Click **Edit** (✏️) bên cạnh deployment hiện có
3. Chọn **Version: Head** (hoặc version mới)
4. Click **Deploy**
5. **URL không đổi**, nhưng code đã được cập nhật
6. **Kết quả**: Cùng URL, nhưng giờ hỗ trợ cả API

**Ưu điểm:**
- ✅ Giữ nguyên URL (không cần update links)
- ✅ Một deployment duy nhất, dễ quản lý
- ✅ Không có conflict

#### Option B: Tạo deployment mới (Nếu muốn tách riêng)

1. **Deploy** → **New deployment**
2. Tạo deployment mới với description: "API Endpoint"
3. **Kết quả**: Có 2 URLs riêng biệt

**Khi nào dùng:**
- Muốn test API riêng trước khi update Dashboard
- Muốn có 2 URLs với permissions khác nhau

---

## 🔄 Workflow đề xuất

### Workflow 1: Single Deployment (Khuyến nghị)

```
┌─────────────────────────────────────┐
│  1 Deployment (Web App)             │
│  URL: /exec                         │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ doGet(e)                      │ │
│  │                               │ │
│  │  if endpoint=getStreakData    │ │
│  │    → Return JSON              │ │
│  │  else                         │ │
│  │    → Return Dashboard HTML    │ │
│  └───────────────────────────────┘ │
└─────────────────────────────────────┘

✅ Ưu điểm:
- Một URL duy nhất
- Dễ quản lý
- Không conflict
```

### Workflow 2: Multiple Deployments (Nếu cần)

```
┌─────────────────────┐  ┌─────────────────────┐
│ Deployment 1        │  │ Deployment 2        │
│ Dashboard           │  │ API                 │
│ URL: /exec          │  │ URL: /exec          │
│                     │  │                     │
│ doGet()             │  │ doGet()             │
│ → Dashboard HTML    │  │ → API JSON only     │
└─────────────────────┘  └─────────────────────┘

⚠️ Lưu ý:
- Cần maintain 2 deployments
- Có thể có 2 URLs khác nhau (nếu khác version)
- Phức tạp hơn
```

---

## ✅ Kết luận

### **KHÔNG CÓ CONFLICT!**

1. **Code hiện tại** đã hỗ trợ cả Dashboard và API trong cùng một `doGet()`
2. **Một deployment** có thể serve cả 2
3. **URL giống nhau**, chỉ khác parameters
4. **Không cần** tạo deployment riêng

### Khuyến nghị

**Sử dụng Single Deployment:**
- ✅ Update deployment hiện có (nếu có)
- ✅ Hoặc tạo deployment mới (nếu chưa có)
- ✅ Một URL duy nhất cho cả Dashboard và API
- ✅ Dễ quản lý và maintain

---

## 🔧 Cách kiểm tra

### Kiểm tra deployment hiện có

1. Mở **Apps Script Editor**
2. Click **Deploy** → **Manage deployments**
3. Xem danh sách deployments

**Nếu có deployment:**
- Click **Edit** để update
- Hoặc tạo deployment mới nếu muốn

**Nếu chưa có:**
- Tạo deployment mới theo hướng dẫn trong `API_SETUP.md`

### Test sau khi deploy

**Test Dashboard:**
```
https://script.google.com/macros/s/{SCRIPT_ID}/exec
```
→ Phải hiển thị Dashboard HTML

**Test API:**
```
https://script.google.com/macros/s/{SCRIPT_ID}/exec?endpoint=getStreakData
```
→ Phải trả về JSON

---

## 📝 Lưu ý quan trọng

### 1. Version Management

Khi update code:
- **Version: Head** = Code mới nhất (khuyến nghị cho development)
- **Version: X** = Version cụ thể (khuyến nghị cho production)

### 2. Permissions

- **Anyone**: Không cần đăng nhập (public)
- **Anyone with Google account**: Cần đăng nhập Google
- **Only myself**: Chỉ bạn mới truy cập được

### 3. URL không đổi

- Khi **update deployment**, URL **KHÔNG ĐỔI**
- Chỉ đổi URL khi **xóa và tạo mới** deployment

### 4. Multiple Deployments

- Có thể có **nhiều deployments** cùng lúc
- Mỗi deployment có **URL riêng** (nếu khác version)
- Nhưng **KHÔNG CẦN** trong trường hợp này

---

## 🆘 Troubleshooting

### Vấn đề: Dashboard không hiển thị sau khi update

**Nguyên nhân**: Code có lỗi hoặc thiếu file HTML

**Giải pháp**:
1. Kiểm tra code `doGet(e)` có đúng không
2. Kiểm tra file `Dashboard.html` có tồn tại không
3. Xem Logger để biết lỗi chi tiết

### Vấn đề: API trả về HTML thay vì JSON

**Nguyên nhân**: Parameter `endpoint=getStreakData` không được truyền đúng

**Giải pháp**:
1. Kiểm tra URL có đúng format không
2. Kiểm tra code `doGet(e)` có xử lý parameter không
3. Test với `api-tester.html`

### Vấn đề: CORS error

**Nguyên nhân**: Headers CORS chưa được set

**Giải pháp**:
1. Kiểm tra code có `.setHeader('Access-Control-Allow-Origin', '*')` không
2. Deploy lại với code mới

---

## 📚 Tài liệu liên quan

- [dev/README.md](../dev/README.md) - Dashboard chạy local (development)
- [API_SETUP.md](./API_SETUP.md) - Hướng dẫn setup API
- [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) - Tài liệu API
- [Google Apps Script Web Apps](https://developers.google.com/apps-script/guides/web)

---

**Version**: 1.0  
**Last Updated**: 2026-01-26
