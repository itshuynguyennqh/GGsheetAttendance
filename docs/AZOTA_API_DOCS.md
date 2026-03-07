# Azota API Docs & Quản lý trạng thái API

Tài liệu này mô tả **cách thu thập (cào) các API mà Azota (azota.vn) sử dụng** và **quản lý trạng thái API** khi Azota cập nhật, endpoint bị đổi hoặc không dùng được nữa.

---

## 1. Cách cào / thu thập API từ Azota

Azota **không công bố API công khai**. Cách thực tế để biết họ gọi API gì:

### 1.1 Dùng DevTools (Chrome / Edge)

1. Mở [https://azota.vn](https://azota.vn), đăng nhập.
2. Mở **DevTools** (F12) → tab **Network**.
3. Bật **Preserve log** (giữ log khi chuyển trang).
4. Lọc **Fetch/XHR** để chỉ xem request API (thường trả về JSON).
5. Thao tác trên Azota (vào lớp, xem bài tập, xem điểm, …).
6. Mỗi request hiện ra: **Method**, **URL**, **Headers**, **Request payload**, **Response**.
7. Ghi lại hoặc export:
   - **Cách nhanh**: Click từng request → tab **Headers** copy **Request URL** và **Request Method**; tab **Payload**/ **Response** copy nếu cần.
   - **Cách đầy đủ**: Trong Network, chuột phải → **Save all as HAR with content** → lưu file `.har`. Có thể dùng công cụ hoặc script để parse HAR và thêm endpoint vào Registry (xem mục 3).

### 1.2 Thông tin cần ghi cho mỗi endpoint

| Trường        | Mô tả |
|---------------|--------|
| Method        | GET, POST, PUT, PATCH, DELETE |
| URL đầy đủ    | Ví dụ: `https://api.azota.vn/api/v1/classrooms` hoặc path tương đối |
| Base URL      | Phần gốc, ví dụ: `https://api.azota.vn` |
| Path          | Phần đường dẫn, ví dụ: `/api/v1/classrooms` |
| Mô tả ngắn    | Ví dụ: "Lấy danh sách lớp học" |
| Headers đặc biệt | Authorization, X-Token, … (không lưu token thật, chỉ ghi tên header) |

---

## 2. Registry API – Format và trạng thái

Registry là danh sách endpoint đã thu thập, kèm **trạng thái** để biết endpoint còn dùng được hay không khi Azota cập nhật.

### 2.1 Trạng thái (status)

| Status      | Ý nghĩa |
|------------|--------|
| `working`  | Đang dùng được (đã kiểm tra gần đây). |
| `deprecated` | Azota có thể đã chuyển sang API khác; nên tìm endpoint thay thế. |
| `broken`   | Gọi lỗi (401/404/500 hoặc response đổi format); không dùng được. |
| `unknown`  | Chưa kiểm tra hoặc chưa rõ. |

### 2.2 Các trường trong Registry (JSON)

```json
{
  "endpoints": [
    {
      "id": "uuid-hoac-id-tu-sinh",
      "method": "GET",
      "path": "/api/v1/classrooms",
      "baseUrl": "https://api.azota.vn",
      "description": "Lấy danh sách lớp học",
      "status": "working",
      "lastCheckedAt": "2025-02-06T10:00:00.000Z",
      "lastSuccessAt": "2025-02-06T10:00:00.000Z",
      "notes": "",
      "createdAt": "2025-02-01T00:00:00.000Z",
      "updatedAt": "2025-02-06T10:00:00.000Z"
    }
  ],
  "meta": {
    "source": "manual",
    "lastUpdated": "2025-02-06T10:00:00.000Z"
  }
}
```

- **lastCheckedAt**: Lần cuối ai đó kiểm tra (gọi thử hoặc dùng trên web).
- **lastSuccessAt**: Lần cuối gọi thành công (nếu có cơ chế test tự động).
- **notes**: Ghi chú khi Azota cập nhật, ví dụ: "Từ 2025-02 Azota đổi response, field `data` thành `items`".

---

## 3. Quản lý khi Azota cập nhật – API không dùng được nữa

1. **Đánh dấu trạng thái**: Trong trang **Quản lý Azota** → **Registry API**, đổi status endpoint đó sang `broken` hoặc `deprecated`, điền **notes** (ngày phát hiện, lỗi gặp phải, ví dụ: "404 Not Found từ 2025-02-06").
2. **Cập nhật lastCheckedAt**: Sau mỗi lần kiểm tra (thủ công hoặc test), cập nhật **lastCheckedAt** để biết endpoint đã được xác minh gần đây.
3. **Tìm endpoint thay thế**: Dùng lại DevTools trên azota.vn, thao tác lại chức năng tương ứng; request mới xuất hiện thường là API mới → thêm vào Registry với status `working`, ghi chú trong notes là thay thế cho endpoint cũ.
4. **Code tích hợp**: Trong code gọi API Azota, nên map endpoint theo **id** hoặc **path** trong Registry; khi đổi sang endpoint mới chỉ cần sửa Registry (hoặc config) thay vì sửa nhiều chỗ trong code.

---

## 4. Import từ HAR (tùy chọn)

File HAR (HTTP Archive) chứa toàn bộ request khi bạn lưu từ DevTools. Có thể:

- Viết script (Node hoặc trong build) đọc file `.har`, parse `entries[].request.url` và `method`, loại bỏ request trùng domain (chỉ giữ request tới domain Azota), rồi tạo bản ghi endpoint với status `unknown` và đưa vào Registry.
- Trong Web App, trang Azota có thể có chức năng **Import HAR**: chọn file → gửi lên server → server parse và merge vào Registry (trùng URL thì cập nhật, mới thì thêm).

Chi tiết triển khai Import HAR có thể bổ sung sau khi định hình xong format HAR và quy ước merge.

---

## 5. Tóm tắt

| Mục | Nội dung |
|-----|----------|
| **Cào API** | DevTools → Network (Fetch/XHR) khi dùng azota.vn; ghi lại Method, URL, mô tả; hoặc export HAR. |
| **API Docs (Azota)** | Là chính file này + **Registry** (danh sách endpoint trong `azota-api-registry.json` hoặc qua API `/api/azota-api-registry`). |
| **Quản lý trạng thái** | Mỗi endpoint có `status`: working / deprecated / broken / unknown; cập nhật `lastCheckedAt`, `notes` khi Azota cập nhật; đánh dấu broken/deprecated và thêm endpoint thay thế vào Registry. |

Registry được lưu trong backend (file hoặc DB) và có thể xem/sửa qua trang **Quản lý Azota** trong Web App.
