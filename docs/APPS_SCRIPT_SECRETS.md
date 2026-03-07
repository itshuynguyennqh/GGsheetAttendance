# Ẩn API Key và Sheet ID trong Apps Script (gs/)

Các key và ID nhạy cảm **không được lưu trong code**, mà lưu trong **Script Properties** của dự án Apps Script.

## Các key cần cấu hình

| Property | Mô tả | Lấy ở đâu |
|----------|--------|-----------|
| `GEMINI_API_KEY` | API key gọi Gemini (AI trợ lý) | https://aistudio.google.com/app/apikey |
| `EXTERNAL_BTVN_SHEET_ID` | ID file Google Sheet chứa báo cáo BTVN Azota (sheet ngoài) | ID trong URL: `https://docs.google.com/spreadsheets/d/<ID>/edit` |

## Cách cấu hình Script Properties

1. Mở file Google Sheet của dự án.
2. Vào **Extensions → Apps Script**.
3. Trong trình soạn Apps Script, chọn **⚙️ Project Settings** (cột trái).
4. Kéo xuống mục **Script properties**.
5. Bấm **Add script property** và thêm từng cặp:
   - **Property**: `GEMINI_API_KEY` → **Value**: (dán API key Gemini của bạn).
   - **Property**: `EXTERNAL_BTVN_SHEET_ID` → **Value**: (dán ID sheet BTVN, ví dụ `1D0JR4CNSGdCqelFQwYpVdjP8DkJkRUqoKPdUVnIs1lo`).
6. Lưu (đóng Project Settings). Code trong `gs/Config.js` sẽ tự đọc các giá trị này khi chạy.

## Lưu ý bảo mật

- **Không** commit API key hoặc Sheet ID vào Git. Repo hiện dùng Script Properties nên file `gs/Config.js` không còn chứa giá trị thật.
- Script Properties chỉ người có quyền chỉnh sửa dự án Apps Script mới xem/sửa được.
- Nếu từng lỡ commit key vào Git: đổi key mới trên Google (revoke key cũ) và cập nhật lại trong Script Properties.
