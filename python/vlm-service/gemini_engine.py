"""Gemini engine: Google Gemini 3.1 Flash Lite for handwriting recognition.

API key: GEMINI_API_KEY hoặc GOOGLE_API_KEY từ biến môi trường.
Rate limit mặc định: GEMINI_RPM_LIMIT (15/phút) cho Flash Lite.
"""
import io
import logging
import os
import threading
import time
from collections import deque
from typing import Optional

log = logging.getLogger(__name__)

# Ưu tiên GEMINI_API_KEY, fallback GOOGLE_API_KEY
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.1-flash-lite-preview").strip()
GEMINI_MAX_NEW_TOKENS = int(os.environ.get("GEMINI_MAX_NEW_TOKENS", "128"))
# Giới hạn request/phút (sliding window). 0 = tắt. Mặc định 15 RPM cho gemini-3.1-flash-lite.
GEMINI_RPM_LIMIT = int(os.environ.get("GEMINI_RPM_LIMIT", "15"))
GEMINI_RPM_WINDOW_SEC = float(os.environ.get("GEMINI_RPM_WINDOW_SEC", "60"))

_rpm_times: deque = deque()
_rpm_lock = threading.Lock()


def _acquire_gemini_rate_limit() -> None:
    """Chờ đến khi được phép gọi API (không quá GEMINI_RPM_LIMIT lần trong GEMINI_RPM_WINDOW_SEC)."""
    if GEMINI_RPM_LIMIT <= 0:
        return
    while True:
        sleep_for = 0.0
        with _rpm_lock:
            now = time.monotonic()
            while _rpm_times and _rpm_times[0] < now - GEMINI_RPM_WINDOW_SEC:
                _rpm_times.popleft()
            if len(_rpm_times) < GEMINI_RPM_LIMIT:
                _rpm_times.append(time.monotonic())
                log.debug(
                    "Gemini RPM slot acquired (%d/%d in %.0fs window)",
                    len(_rpm_times),
                    GEMINI_RPM_LIMIT,
                    GEMINI_RPM_WINDOW_SEC,
                )
                return
            oldest = _rpm_times[0]
            sleep_for = max(0.05, GEMINI_RPM_WINDOW_SEC - (now - oldest) + 0.02)
        log.info(
            "Gemini RPM limit (%d/min): sleeping %.1fs",
            GEMINI_RPM_LIMIT,
            sleep_for,
        )
        time.sleep(sleep_for)

_client = None


def _get_client():
    """Lazy-init Gemini client (dùng API key từ môi trường)."""
    global _client
    if _client is not None:
        return _client
    if not GEMINI_API_KEY:
        raise RuntimeError(
            "Chưa cấu hình API key. Đặt biến môi trường GEMINI_API_KEY hoặc GOOGLE_API_KEY."
        )
    from google import genai

    _client = genai.Client(api_key=GEMINI_API_KEY)
    return _client


def ensure_pipeline_loaded() -> None:
    """Kiểm tra client và API key có sẵn (tương đương pre-load pipeline)."""
    _get_client()
    log.info(
        "Gemini client ready, model=%s, RPM limit=%s/%ss",
        GEMINI_MODEL,
        GEMINI_RPM_LIMIT if GEMINI_RPM_LIMIT > 0 else "off",
        GEMINI_RPM_WINDOW_SEC,
    )


def warmup() -> None:
    """Gọi một request đơn giản để warm-up (tùy chọn)."""
    try:
        client = _get_client()
        # Text-only warmup
        r = client.models.generate_content(
            model=GEMINI_MODEL,
            contents="Say OK in one word.",
            config={"max_output_tokens": 5},
        )
        if r and getattr(r, "text", None):
            log.info("Gemini warm-up done: %s", r.text[:50])
        else:
            log.info("Gemini warm-up done")
    except Exception as e:
        log.warning("Gemini warm-up failed (non-fatal): %s", e)


def _image_to_part(image_path_or_pil):
    """Chuyển ảnh (đường dẫn file hoặc PIL.Image) thành Part cho Gemini."""
    from google.genai import types

    if isinstance(image_path_or_pil, str):
        with open(image_path_or_pil, "rb") as f:
            data = f.read()
        mime = "image/jpeg"
        if image_path_or_pil.lower().endswith(".png"):
            mime = "image/png"
    else:
        # PIL.Image
        from PIL import Image

        img = (
            image_path_or_pil
            if isinstance(image_path_or_pil, Image.Image)
            else Image.fromarray(image_path_or_pil)
        )
        rgb = img.convert("RGB")
        buf = io.BytesIO()
        rgb.save(buf, format="JPEG", quality=95)
        data = buf.getvalue()
        mime = "image/jpeg"

    return types.Part.from_bytes(data=data, mime_type=mime)


def recognize(
    image_path_or_pil,
    prompt: str,
    max_new_tokens: Optional[int] = None,
) -> str:
    """
    Nhận diện chữ viết trong ảnh bằng Gemini.

    Args:
        image_path_or_pil: đường dẫn file (str) hoặc PIL.Image
        prompt: câu lệnh cho model (ví dụ mô tả đọc tên học sinh)
        max_new_tokens: giới hạn token đầu ra (mặc định từ env)

    Returns:
        Chuỗi text do model trả về.
    """
    _acquire_gemini_rate_limit()
    client = _get_client()
    tokens = max_new_tokens or GEMINI_MAX_NEW_TOKENS
    image_part = _image_to_part(image_path_or_pil)

    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=[image_part, prompt],
        config={"max_output_tokens": tokens},
    )

    text = ""
    if getattr(response, "text", None):
        text = response.text.strip()
    elif response.candidates:
        part = response.candidates[0].content.parts[0] if response.candidates[0].content.parts else None
        if part and getattr(part, "text", None):
            text = part.text.strip()

    log.info("Gemini inference done, model=%s, output_len=%d", GEMINI_MODEL, len(text))
    return text
