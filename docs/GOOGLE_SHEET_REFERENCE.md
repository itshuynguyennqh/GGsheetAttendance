# Tham chiếu Google Sheet – Cursor & Dashboard

> File này lưu link Google Sheet để Cursor AI và code có thể đọc/ tham chiếu dữ liệu.

## Links

| Mục đích | Link | Ghi chú |
|----------|------|---------|
| **Xem dữ liệu (HTML)** | https://docs.google.com/spreadsheets/d/e/2PACX-1vQEhqDh42dJOpUCec_9TBvjOWiYz2NyuzCiAD4BIGKLbWMm0XWgwU1ufVjBkLe3zL8mRWc1y3eYknD8/pubhtml | Danh sách học viên 2025/2026 – Publish to web (HTML) |
| **Dữ liệu CSV (code)** | https://docs.google.com/spreadsheets/d/e/2PACX-1vQEhqDh42dJOpUCec_9TBvjOWiYz2NyuzCiAD4BIGKLbWMm0XWgwU1ufVjBkLe3zL8mRWc1y3eYknD8/pub?output=csv&gid=235273744 | Sheet **Gộp_Nối_Tiếp** – dùng trong `dev/config.js` |

- **pubhtml**: dùng để xem trong trình duyệt (HTML)
- **CSV với gid=235273744**: dùng cho code – trả về dữ liệu dạng CSV từ sheet cụ thể

---

## Cấu trúc dữ liệu sheet "Gộp_Nối_Tiếp" (Long format – 1 dòng = 1 record điểm danh)

| Cột | Index | Mô tả |
|-----|-------|-------|
| Mã HV | 0 | Mã học viên |
| Họ tên | 1 | Họ và tên đầy đủ |
| Tên | 2 | Tên gọi |
| Lớp | 3 | Tên lớp |
| Tháng | 4 | Tháng (vd: 6.2025) |
| Buổi | 5 | Số buổi (1, 2, 3, ...) |
| Điểm danh | 6 | X / B / M / P |

Code (`streak-logic.js`, `quyet-dinh-hoc-vien.js`) tự phát hiện format. Format cũ (wide) vẫn được hỗ trợ.

---

## ⚠️ Chuyển từ sheet cụ thể sang "Toàn bộ" – có ảnh hưởng

### Có ảnh hưởng – nên giữ đúng sheet "Gộp_Nối_Tiếp"

Khi **Publish to web**:
- **Chọn sheet "Gộp_Nối_Tiếp"**: CSV chỉ chứa dữ liệu sheet đó → code chạy đúng
- **Chọn "Toàn bộ" (Entire document)**: CSV thường chỉ xuất **sheet đầu tiên** trong workbook

Vấn đề:

1. **Sheet đầu tiên** thường không phải "Gộp_Nối_Tiếp" (vd: "Tháng 1", "Tháng 2", "Danh sách", v.v.)
2. Cấu trúc cột khác hẳn (vd: chỉ có Mã HV, Tên, Buổi 1, Buổi 2... thay vì format `Tháng||Buổi||Giá trị`)
3. Hàm sẽ nhận sai dữ liệu → lỗi, kết quả sai, dashboard không dùng được

### Các hàm bị ảnh hưởng

| File | Hàm chính | Cần gì |
|------|-----------|--------|
| `streak-logic.js` | `getStreakDataFromRows`, `parseThangBuoi` | Cột 4+ có format `Tháng X.YYYY\|\|Buổi N\|\|X` |
| `quyet-dinh-hoc-vien.js` | `getQuyetDinhHocVienFromRows` | Cùng cấu trúc Gộp_Nối_Tiếp |
| `dev/index.html` | Fetch CSV → xử lý | `CSV_URL` trong `config.js` phải trỏ đúng sheet |

### Khuyến nghị

- **Tiếp tục publish riêng sheet "Gộp_Nối_Tiếp"**, không đổi sang "Toàn bộ"
- Giữ `gid=235273744` trong `CSV_URL` (trỏ đúng Gộp_Nối_Tiếp)
- Nếu cần thêm sheet khác, tạo thêm link publish riêng và cấu hình riêng trong code
