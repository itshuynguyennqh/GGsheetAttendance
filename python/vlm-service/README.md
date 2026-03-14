# VLM Service (Qwen2-VL-2B + OpenVINO)

Service nhận dạng chữ viết tay bằng Vision Language Model (VLM), tối ưu cho CPU Intel.

## Yêu cầu hệ thống

- **CPU**: Intel Core i5 thế hệ 11+ (có hỗ trợ AVX2/VNNI)
- **RAM**: 16GB (mô hình INT4 dùng ~4GB)
- **Python**: 3.10+
- **OS**: Windows 10/11

## Cài đặt nhanh

```powershell
cd python/vlm-service
.\run.ps1
```

Script `run.ps1` sẽ tự động:
1. Tạo virtual environment
2. Cài dependencies từ `requirements.txt`
3. Khởi động service tại `http://127.0.0.1:8001`

## Cài đặt thủ công

```powershell
cd python/vlm-service
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```

## Mô hình

Mặc định sử dụng `OpenVINO/Qwen2-VL-2B-Instruct-int4-ov` (INT4, ~2GB).
Lần chạy đầu tiên sẽ tự động tải từ HuggingFace Hub (~1-2 phút).

### Tuỳ chỉnh đường dẫn mô hình

```powershell
$env:VLM_MODEL_PATH = "D:\models\Qwen2-VL-2B-int4-ov"
uvicorn main:app --reload --port 8001
```

### Tự convert mô hình bằng optimum-cli

```bash
pip install optimum[openvino]
optimum-cli export openvino \
  --model Qwen/Qwen2-VL-2B-Instruct \
  --weight-format int4 \
  --trust-remote-code \
  Qwen2-VL-2B-Instruct-int4-ov
```

## API Endpoints

| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/health` | Kiểm tra service (`{"ok": true, "engine": "openvino"}` hoặc `"gemini"` / `"gemma"`) |
| POST | `/ocr` | Nhận dạng chữ viết tay từ ảnh base64 |
| POST | `/match-names` | Khớp tên fuzzy (giống ocr-service) |
| POST | `/ocr-match` | Nhận dạng + khớp tên trong 1 lần gọi (VLM in-context learning) |

### POST /ocr

```json
{
  "image_base64": "...",
  "language": "vi"
}
```

Response: `{"text": "Nguyễn Văn An"}`

### POST /ocr-match

```json
{
  "image_base64": "...",
  "student_names": ["Phạm Hà An", "Nguyễn Trần Vân", "Phan Thanh"],
  "language": "vi",
  "threshold": 60
}
```

Response:
```json
{
  "text": "Pham Ha An",
  "matched": "Phạm Hà An",
  "index": 0,
  "score": 95.0,
  "fallback": false
}
```

## Biến môi trường

### Engine OpenVINO (mặc định)

| Biến | Mặc định | Mô tả |
|------|----------|-------|
| `VLM_MODEL_PATH` | `OpenVINO/Qwen2-VL-2B-Instruct-int4-ov` | Đường dẫn/tên mô hình |
| `VLM_DEVICE` | `CPU` | Thiết bị suy luận |
| `VLM_MAX_NEW_TOKENS` | `50` | Số token tối đa sinh ra |

### Engine Gemini / Gemma (Google API)

Để dùng **Google Gemini** hoặc **Gemma 3 27B** (cùng API key), đặt:

| Biến | Mặc định | Mô tả |
|------|----------|-------|
| `VLM_ENGINE` | `openvino` | `gemini` = Gemini 3.1 Flash Lite, `gemma` = Gemma 3 27B |
| `GEMINI_API_KEY` hoặc `GOOGLE_API_KEY` | — | **Bắt buộc**. Lấy key tại [Google AI Studio](https://aistudio.google.com/app/apikey) |
| `GEMINI_MODEL` | (tùy engine) | Với `gemini`: `gemini-3.1-flash-lite-preview`. Với `gemma`: `gemma-3-27b-it` (có thể ghi đè) |
| `GEMINI_MAX_NEW_TOKENS` | `128` | Số token tối đa đầu ra |
| `GEMINI_RPM_LIMIT` | `15` | Tối đa số request Gemini trong cửa sổ 60s (sliding). `0` = tắt giới hạn |
| `GEMINI_RPM_WINDOW_SEC` | `60` | Độ dài cửa sổ (giây) cho RPM |

Ví dụ chạy với **Gemini 3.1 Flash Lite**:

```powershell
$env:VLM_ENGINE = "gemini"
$env:GEMINI_API_KEY = "your-api-key-here"
uvicorn main:app --reload --port 8001
```

Ví dụ chạy với **Gemma 3 27B**:

```powershell
$env:VLM_ENGINE = "gemma"
$env:GEMINI_API_KEY = "your-api-key-here"
uvicorn main:app --reload --port 8001
```

API key **chỉ** đọc từ môi trường, không hardcode trong mã.

### Script đổi model (PowerShell, VLM Python)

Trong thư mục `python/vlm-service`:

```powershell
.\set-model.ps1              # chọn 1–4 tương tác
.\set-model.ps1 gemini     # Gemini (mặc định flash-lite)
.\set-model.ps1 gemma      # Gemma 3 27B
.\set-model.ps1 openvino   # mô hình local
# rồi:
.\run.ps1
```

### Google Apps Script — đổi model

Menu **Báo cáo Buổi** → **Đổi model Gemini (OCR / AI)** — lưu `GEMINI_MODEL` vào Script Properties (cùng chỗ với API key). Hoặc thủ công: Project Settings → Script properties → `GEMINI_MODEL` = tên model (ví dụ `gemini-2.0-flash`).

## Tích hợp với Node backend

Đặt biến môi trường trước khi chạy Node server:

```powershell
$env:OCR_ENGINE_MODE = "vlm"
npm run dev:full
```

Khi `OCR_ENGINE_MODE=vlm`, Node backend sẽ gọi VLM service (port 8001) thay vì OCR service (port 8000).

**Song song (Node → VLM):** Node vẫn có thể gửi nhiều request cùng lúc (`AZOTA_OCR_CONCURRENCY`); **Python Gemini** tự **xếp hàng** để không vượt **15 request/phút** (mặc định). Các request thừa sẽ sleep trong service — an toàn với Flash Lite RPM.

```powershell
$env:AZOTA_OCR_CONCURRENCY = "6"
$env:GEMINI_RPM_LIMIT = "15"        # mặc định; 0 = không giới hạn
```

**Apps Script:** OCR Gemini gọi **tuần tự**, cách nhau ~4s (15/phút). Sửa `GEMINI_RPM_LIMIT` / `GEMINI_MIN_INTERVAL_MS` trong `ExamResultAzota.js` nếu cần.

## Hiệu năng (i5-1135G7, 16GB RAM)

- Nạp mô hình lần đầu: ~1-2 phút
- Suy luận mỗi ảnh: ~3-8 giây
- RAM sử dụng: ~4-5GB
- Các lần nạp sau: nhanh hơn nhiều (OpenVINO cache)

## Lưu ý

- Tắt bớt ứng dụng nặng (Chrome nhiều tab) khi chạy để tránh tràn RAM
- Service có thể chạy song song với ocr-service (khác port)
- Endpoint `/ocr-match` là điểm mạnh chính: VLM nhìn ảnh + biết danh sách tên => đoán chính xác hơn
