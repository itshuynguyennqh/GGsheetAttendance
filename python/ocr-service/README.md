# OCR Service (Python)

Microservice xử lý ảnh (OpenCV), OCR (EasyOCR hoặc **PaddleOCR**), khớp tên (thefuzz). Dùng cho tính năng "Điểm chấm Azota" trên hệ thống quản lý.

- **EasyOCR** (mặc định): in sẵn, đủ dùng cho chữ in.
- **PaddleOCR**: model Latin/PP-OCRv5 hỗ trợ **chữ viết tay** và **tiếng Việt** tốt hơn (tên học sinh viết tay). Chọn bằng biến môi trường `OCR_ENGINE=paddleocr`.

## Cài đặt

**Bắt buộc dùng virtual environment** để tránh lỗi `ModuleNotFoundError: No module named 'cv2'`.

### Chỉ EasyOCR (mặc định)

### Windows (PowerShell)

```powershell
cd python/ocr-service
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### Dùng PaddleOCR (chữ viết tay + tên tiếng Việt)

Sau khi đã cài xong requirements.txt:

```powershell
pip install -r requirements-paddle.txt
set OCR_ENGINE=paddleocr
uvicorn main:app --reload --port 8000
```

Nếu gặp lỗi **"The process cannot access the file because it is being used"**: đóng Cursor/IDE tạm thời, mở **Command Prompt hoặc PowerShell mới**, chạy lại từ bước `.\venv\Scripts\Activate.ps1` rồi `pip install -r requirements.txt`.

### Linux/macOS

```bash
cd python/ocr-service
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Chạy

**Luôn kích hoạt venv trước khi chạy uvicorn.**

- Mặc định (EasyOCR): `uvicorn main:app --reload --port 8000`
- Chữ viết tay / tên Việt (PaddleOCR): `set OCR_ENGINE=paddleocr` rồi chạy uvicorn như trên.

### Windows (PowerShell)

```powershell
cd python/ocr-service
.\venv\Scripts\Activate.ps1
uvicorn main:app --reload --port 8000
```

### Linux/macOS

```bash
cd python/ocr-service
source venv/bin/activate
uvicorn main:app --reload --port 8000
```

Sau khi chạy thành công sẽ thấy: `Uvicorn running on http://127.0.0.1:8000`

Node backend cần biến môi trường `OCR_SERVICE_URL=http://localhost:8000` (mặc định đã dùng 8000).

## API

- `GET /health` – Kiểm tra sống
- `POST /ocr` – Body: `{ "image_base64": "...", "language": "vi" }` → `{ "text": "..." }`
- `POST /match-names` – Body: `{ "recognized_names": [], "student_names": [], "threshold": 60 }` → `{ "matches": [...] }`
