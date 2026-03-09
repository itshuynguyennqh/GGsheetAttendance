"""OCR engine: EasyOCR (default) or PaddleOCR (chữ viết tay + Latin/Việt tốt hơn)."""
import logging
import os
import tempfile
import threading
import numpy as np
from typing import Optional

log = logging.getLogger(__name__)

# Engine: "easyocr" (default) | "paddleocr"
OCR_ENGINE = os.environ.get("OCR_ENGINE", "easyocr").strip().lower()
if OCR_ENGINE not in ("easyocr", "paddleocr"):
    OCR_ENGINE = "easyocr"

# Model: ppocrv5_server = PP-OCRv5_server_rec (viết tay tốt hơn, Trung/Anh/Nhật, cần RAM 16GB+)
OCR_MODEL = os.environ.get("OCR_MODEL", "").strip().lower()
USE_OPENVINO = os.environ.get("USE_OPENVINO", "").strip() in ("1", "true", "yes")

# Set oneDNN/MKLDNN off before any paddle import (Paddle 3.3+ Windows CPU bug #77340)
if OCR_ENGINE == "paddleocr":
    os.environ["FLAGS_use_mkldnn"] = "0"
    os.environ["FLAGS_use_dnnl"] = "0"

# Lazy-load to avoid slow startup when only match-names is used
_reader: Optional[object] = None
_reader_lock = threading.Lock()
# When PaddleOCR hits oneDNN NotImplementedError on Windows, we fall back to EasyOCR
_paddleocr_failed = False


def _get_reader_easyocr(lang: str = "vi"):
    import easyocr
    langs = ["vi", "en"] if lang == "vi" else [lang, "vi"]
    return easyocr.Reader(langs, gpu=False, verbose=False)


def _get_reader_paddleocr(lang: str = "vi"):
    from paddleocr import PaddleOCR
    import re
    use_lang = "la" if lang == "vi" else lang  # la = Latin (includes Vietnamese)
    kwargs = dict(
        lang=use_lang,
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
        device="cpu",
    )
    if OCR_MODEL == "ppocrv5_server" and lang == "vi":
        kwargs["text_recognition_model_name"] = "PP-OCRv5_server_rec"
    while True:
        try:
            return PaddleOCR(**kwargs)
        except ValueError as e:
            m = re.search(r"Unknown argument:\s*(\w+)", str(e), re.I)
            if m:
                name = m.group(1)
                if name in kwargs:
                    log.warning("PaddleOCR does not support %s, removing: %s", name, str(e)[:60])
                    kwargs.pop(name)
                    continue
            raise
        except Exception as e:
            if "text_recognition_model_name" in kwargs and "no model source" in str(e).lower():
                model = kwargs.pop("text_recognition_model_name")
                log.warning("Model %s not available, falling back to default: %s", model, str(e)[:80])
                continue
            raise


def _get_reader(lang: str = "vi"):
    global _reader
    if _reader is not None:
        return _reader
    with _reader_lock:
        if _reader is None:
            if OCR_ENGINE == "paddleocr":
                _reader = _get_reader_paddleocr(lang)
            else:
                _reader = _get_reader_easyocr(lang)
    return _reader


def ensure_reader_loaded(language: str = "vi") -> None:
    """Pre-load the OCR reader (e.g. at app startup) so first /ocr request doesn't 500."""
    _get_reader(language)


def _recognize_easyocr(image: np.ndarray, reader) -> str:
    results = reader.readtext(image, detail=0)
    if not results:
        return ""
    return " ".join(str(r).strip() for r in results).strip()


def _recognize_paddleocr(image: np.ndarray, reader) -> str:
    import cv2
    # PaddleOCR 3.x predict expects file path; temp file works on Windows (delete=False)
    fd, path = tempfile.mkstemp(suffix=".png")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(cv2.imencode(".png", image)[1].tobytes())
        # Pipeline expects path(s); pass as list so batch_sampler gets consistent type
        pred = reader.predict([path])  # returns list of OCRResult
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass
    texts = []
    for res in pred or []:
        rec_texts = None
        # PaddleX OCRResult: subscriptable res["rec_texts"]
        try:
            if hasattr(res, "__getitem__"):
                rec_texts = res["rec_texts"]
        except (KeyError, TypeError):
            pass
        if not rec_texts and hasattr(res, "res") and isinstance(getattr(res, "res", None), dict):
            rec_texts = res.res.get("rec_texts")
        if not rec_texts and isinstance(res, dict):
            rec_texts = (res.get("res") or {}).get("rec_texts") if isinstance(res.get("res"), dict) else res.get("rec_texts")
        if rec_texts:
            if isinstance(rec_texts, (list, tuple)):
                for t in rec_texts:
                    if t is None:
                        continue
                    # PaddleOCR may return (text, score) tuples
                    texts.append(t[0] if isinstance(t, (list, tuple)) and len(t) > 0 else t)
            else:
                texts.append(rec_texts)
    return " ".join(str(t).strip() for t in texts).strip()


def _is_paddle_onednn_error(exc: BaseException) -> bool:
    msg = str(exc).lower()
    return (
        "convertpirattribute2runtimeattribute" in msg
        or "onednn" in msg
        or "arrayattribute" in msg
    )


def recognize_text(image: np.ndarray, language: str = "vi") -> str:
    """
    Run OCR on image (BGR numpy array). Returns single string (e.g. student name).
    Uses EasyOCR or PaddleOCR depending on env OCR_ENGINE.
    On Windows CPU, if PaddleOCR hits oneDNN bug (#77340), falls back to EasyOCR.
    """
    global _reader, _paddleocr_failed
    if image is None or image.size == 0:
        return ""
    # If we already know PaddleOCR fails (oneDNN on Windows), use EasyOCR
    if _paddleocr_failed:
        if _reader is None:
            with _reader_lock:
                if _reader is None:
                    _reader = _get_reader_easyocr(language)
        return _recognize_easyocr(image, _reader)
    reader = _get_reader(language)
    if OCR_ENGINE == "paddleocr":
        try:
            return _recognize_paddleocr(image, reader)
        except NotImplementedError as e:
            if _is_paddle_onednn_error(e):
                log.warning(
                    "PaddleOCR oneDNN error on Windows CPU, falling back to EasyOCR: %s",
                    str(e)[:80],
                )
                with _reader_lock:
                    _paddleocr_failed = True
                    _reader = _get_reader_easyocr(language)
                return _recognize_easyocr(image, _reader)
            raise
    return _recognize_easyocr(image, reader)
