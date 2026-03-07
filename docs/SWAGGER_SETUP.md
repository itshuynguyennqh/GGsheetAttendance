# 📚 HƯỚNG DẪN SỬ DỤNG SWAGGER UI

Hướng dẫn sử dụng Swagger UI để xem và test API documentation.

## 🎯 Tổng quan

Hệ thống đã có:
- ✅ **OpenAPI Specification** (`docs/openapi.yaml`) - Chuẩn OpenAPI 3.0.3
- ✅ **Swagger UI** (`swagger-ui.html`) - Giao diện để xem và test API

## 🚀 Cách sử dụng

### Option 1: Mở file local (Đơn giản nhất)

1. **Mở file `swagger-ui.html`** trong browser
   - Double-click file
   - Hoặc right-click → Open with → Browser

2. **Swagger UI sẽ tự động load** file `docs/openapi.yaml`

3. **Cập nhật Script ID** (nếu cần):
   - Click button **"⚙️ Cập nhật Script ID"** ở topbar
   - Nhập Script ID của bạn
   - Script ID sẽ được lưu trong localStorage

4. **Test API**:
   - Click vào endpoint muốn test
   - Click **"Try it out"**
   - Điền parameters (nếu có)
   - Click **"Execute"**
   - Xem response

### Option 2: Sử dụng Swagger Editor Online

1. **Mở [Swagger Editor](https://editor.swagger.io/)**

2. **Copy nội dung** file `docs/openapi.yaml`

3. **Paste vào editor**

4. **Xem và test API** trực tiếp trên editor

5. **Export**:
   - File → Download JSON/YAML
   - Hoặc Generate Client/Server

### Option 3: Host Swagger UI trên server

Nếu bạn có web server:

1. **Upload files**:
   - `swagger-ui.html`
   - `docs/openapi.yaml`

2. **Mở** `swagger-ui.html` từ server

3. **Update path** trong `swagger-ui.html`:
   ```javascript
   const specUrl = '/path/to/openapi.yaml';
   ```

### Option 4: Sử dụng Docker (Nâng cao)

```bash
# Run Swagger UI với Docker
docker run -p 8080:8080 \
  -e SWAGGER_JSON=/openapi.yaml \
  -v $(pwd)/docs/openapi.yaml:/openapi.yaml \
  swaggerapi/swagger-ui
```

Sau đó mở: `http://localhost:8080`

---

## 📝 Cập nhật OpenAPI Spec

### Khi thêm endpoint mới

1. **Mở** `docs/openapi.yaml`

2. **Thêm path mới** trong `paths:`:
   ```yaml
   paths:
     /new-endpoint:
       get:
         summary: Mô tả endpoint
         # ... thêm các thông tin khác
   ```

3. **Thêm schema mới** (nếu cần) trong `components/schemas:`

4. **Save file**

5. **Refresh Swagger UI** để xem thay đổi

### Khi thay đổi response format

1. **Cập nhật schema** trong `components/schemas:`

2. **Cập nhật examples** (nếu có)

3. **Save và refresh**

---

## 🔧 Cấu hình

### Thay đổi Script ID mặc định

Trong `docs/openapi.yaml`:
```yaml
servers:
  - url: https://script.google.com/macros/s/{scriptId}/exec
    variables:
      scriptId:
        default: YOUR_SCRIPT_ID_HERE  # ← Thay đổi ở đây
```

### Thay đổi theme Swagger UI

Trong `swagger-ui.html`, thêm CSS:
```css
.swagger-ui .topbar {
  background: YOUR_COLOR;
}
```

### Thêm authentication (nếu cần)

Trong `openapi.yaml`:
```yaml
components:
  securitySchemes:
    apiKey:
      type: apiKey
      in: query
      name: api_key
```

---

## 🧪 Test API trong Swagger UI

### Bước 1: Chọn endpoint

1. Mở Swagger UI
2. Tìm endpoint muốn test (ví dụ: `GET /?endpoint=getStreakData`)
3. Click vào endpoint để mở rộng

### Bước 2: Try it out

1. Click button **"Try it out"**
2. Form sẽ hiện ra để nhập parameters

### Bước 3: Điền parameters

- **endpoint**: `getStreakData` (required)
- **month**: `6.2025` (optional)
- **buoi**: `2` (optional)

### Bước 4: Execute

1. Click **"Execute"**
2. Xem response:
   - **Response code**: 200, 400, 500...
   - **Response body**: JSON data
   - **Response headers**: Headers từ server

### Bước 5: Xem examples

- Scroll xuống phần **"Examples"** để xem các ví dụ response
- Copy code samples (curl, JavaScript, Python...)

---

## 📊 Tính năng Swagger UI

### 1. Interactive API Testing
- ✅ Test API trực tiếp trong browser
- ✅ Không cần Postman hoặc curl
- ✅ Xem request/response real-time

### 2. Code Generation
- ✅ Generate client code (JavaScript, Python, Java...)
- ✅ Export OpenAPI spec (JSON/YAML)
- ✅ Download spec file

### 3. Documentation
- ✅ Auto-generated từ OpenAPI spec
- ✅ Schema documentation
- ✅ Examples và code samples

### 4. Validation
- ✅ Validate request parameters
- ✅ Validate response format
- ✅ Show errors nếu có

---

## 🐛 Troubleshooting

### Vấn đề: Không load được openapi.yaml

**Nguyên nhân**: CORS hoặc file path không đúng

**Giải pháp**:
1. Kiểm tra file `docs/openapi.yaml` có tồn tại không
2. Thử mở file trực tiếp trong browser: `file:///path/to/docs/openapi.yaml`
3. Sử dụng Swagger Editor online thay vì local file
4. Hoặc host file trên server/web

### Vấn đề: "Try it out" không hoạt động

**Nguyên nhân**: CORS error khi gọi API

**Giải pháp**:
1. Kiểm tra API có CORS headers không
2. Sử dụng CORS proxy (không khuyến nghị cho production)
3. Test từ server-side thay vì browser

### Vấn đề: Script ID không được lưu

**Nguyên nhân**: Browser chặn localStorage

**Giải pháp**:
1. Cho phép localStorage trong browser settings
2. Hoặc update Script ID trực tiếp trong `openapi.yaml`

---

## 📚 Tài liệu tham khảo

- [OpenAPI Specification](https://swagger.io/specification/)
- [Swagger UI Documentation](https://swagger.io/tools/swagger-ui/)
- [Swagger Editor](https://editor.swagger.io/)

---

## 🎨 Customization

### Thêm logo

Trong `swagger-ui.html`:
```html
<style>
  .swagger-ui .topbar .download-url-wrapper::before {
    content: url('path/to/logo.png');
    display: inline-block;
    margin-right: 10px;
  }
</style>
```

### Thay đổi màu sắc

```css
.swagger-ui .topbar {
  background: YOUR_COLOR;
}

.swagger-ui .btn.execute {
  background: YOUR_COLOR;
}
```

---

**Version**: 1.0  
**Last Updated**: 2026-01-26
