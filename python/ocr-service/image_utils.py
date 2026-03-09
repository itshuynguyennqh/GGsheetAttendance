"""OpenCV image preprocessing: crop, align, denoise for name region."""
import os
import cv2
import numpy as np

PREPROCESS_HANDWRITING = os.environ.get("PREPROCESS_HANDWRITING", "").strip() in ("1", "true", "yes")
PREPROCESS_DILATION = os.environ.get("PREPROCESS_DILATION", "").strip() in ("1", "true", "yes")
PREPROCESS_REMOVE_DOTS = os.environ.get("PREPROCESS_REMOVE_DOTS", "").strip() in ("1", "true", "yes")


def decode_base64_to_image(base64_string: str) -> np.ndarray:
    """Decode base64 string to OpenCV image (BGR)."""
    import base64
    img_data = base64.b64decode(base64_string)
    nparr = np.frombuffer(img_data, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image from base64")
    return img


def denoise_and_enhance(img: np.ndarray) -> np.ndarray:
    """Light denoising and contrast for better OCR on small name crops."""
    if img is None or img.size == 0:
        return img
    # Optional: bilateral filter to reduce noise while keeping edges
    denoised = cv2.bilateralFilter(img, 5, 50, 50)
    # Convert to grayscale for OCR if needed (EasyOCR accepts BGR too)
    return denoised


def enhance_for_handwriting_ocr(img: np.ndarray) -> np.ndarray:
    """
    Tiền xử lý tối ưu cho chữ viết tay: upscale khi nhỏ, sharpening, Gaussian + Adaptive Threshold.
    Chỉ dùng cho pipeline /ocr, không dùng cho /image-hash, /match-by-image.
    """
    if img is None or img.size == 0:
        return img
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape[:2]
    if h < 50:
        gray = cv2.resize(gray, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    kernel = np.array([[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]])
    sharpened = cv2.filter2D(gray, -1, kernel)
    binary = cv2.adaptiveThreshold(
        sharpened, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY, 21, 10,
    )
    if PREPROCESS_DILATION:
        kernel_dil = np.ones((2, 2), np.uint8)
        binary = cv2.dilate(binary, kernel_dil)
    if PREPROCESS_REMOVE_DOTS:
        kernel_h = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 5))
        binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel_h)
    return cv2.cvtColor(binary, cv2.COLOR_GRAY2BGR)


def preprocess_for_ocr(base64_string: str) -> np.ndarray:
    """
    Decode base64 image and apply light preprocessing.
    Azota often provides already-cropped name region; we crop 35px from the right
    to remove noisy text (e.g. "Lớp") then denoise.
    """
    img = decode_base64_to_image(base64_string)
    # Crop 35px from right to remove disturbing text (e.g. "Lớp")
    if img.shape[1] > 35:
        img = img[:, :-35]
    img = denoise_and_enhance(img)
    return img
