"""OpenCV image preprocessing: crop, align, denoise for name region."""
import cv2
import numpy as np


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
