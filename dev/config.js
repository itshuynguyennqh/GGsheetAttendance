/**
 * Cấu hình cho Dashboard – web thuần, không deploy App Script.
 * Dữ liệu kéo từ Google Sheet qua "Publish to web" (CSV).
 *
 * Cách lấy CSV_URL:
 * 1. Mở Google Sheet chứa sheet "Gộp_Nối_Tiếp"
 * 2. File → Share → Publish to web
 * 3. Chọn sheet "Gộp_Nối_Tiếp" (hoặc sheet có cùng cấu trúc cột)
 * 4. Format: CSV → Publish → copy link
 * Hoặc dùng: https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/gid/{SHEET_GID}/export?format=csv
 */
// Dùng link CSV (output=csv), KHÔNG dùng pubhtml (trả về HTML/JS → dữ liệu lỗi).
// Publish to web → chọn "Comma-separated values (.csv)" → copy link.
window.CSV_URL = window.CSV_URL || 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQEhqDh42dJOpUCec_9TBvjOWiYz2NyuzCiAD4BIGKLbWMm0XWgwU1ufVjBkLe3zL8mRWc1y3eYknD8/pub?output=csv&gid=235273744';
