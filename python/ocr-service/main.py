"""FastAPI OCR service: /ocr, /match-names, /image-hash."""
import logging
import sys
import warnings
from contextlib import asynccontextmanager

import cv2
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

from schemas import (
    OcrRequest,
    OcrResponse,
    MatchNamesRequest,
    MatchNamesResponse,
    MatchItem,
    ImageHashRequest,
    ImageHashResponse,
    MatchByImageRequest,
    MatchByImageResponse,
)
from image_utils import preprocess_for_ocr, enhance_for_handwriting_ocr, PREPROCESS_HANDWRITING
from ocr_engine import recognize_text, ensure_reader_loaded, OCR_ENGINE
from matcher import match_names

# Logger for OCR service (stdout so uvicorn shows it)
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s [%(name)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    stream=sys.stdout,
)
log = logging.getLogger("ocr_service")

# Suppress PyTorch pin_memory warning when no GPU (EasyOCR still works)
warnings.filterwarnings(
    "ignore",
    message=".*pin_memory.*no accelerator is found.*",
    category=UserWarning,
    module="torch.utils.data.dataloader",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Pre-load OCR models and warm-up with a fake image so first /ocr requests don't lag."""
    import asyncio
    import numpy as np
    log.info("OCR engine: %s (set OCR_ENGINE=paddleocr for handwriting/Vietnamese names)", OCR_ENGINE)
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, ensure_reader_loaded, "vi")
    # Warm-up: run OCR on a small fake image to avoid first-request lag
    def _warmup():
        fake_img = np.zeros((32, 100, 3), dtype=np.uint8)
        fake_img.fill(255)
        recognize_text(fake_img, "vi")
    await loop.run_in_executor(None, _warmup)
    log.info("OCR warm-up done")
    yield


app = FastAPI(title="OCR Service", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000", "http://127.0.0.1:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"ok": True}


def _should_enhance_handwriting() -> bool:
    return PREPROCESS_HANDWRITING or OCR_ENGINE == "paddleocr"


@app.post("/ocr", response_model=OcrResponse)
def ocr(req: OcrRequest):
    """Decode base64 image, preprocess with OpenCV, run OCR, return text."""
    try:
        img = preprocess_for_ocr(req.image_base64)
        if _should_enhance_handwriting():
            img = enhance_for_handwriting_ocr(img)
        text = recognize_text(img, language=req.language or "vi")
        return OcrResponse(text=text or "")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.exception("OCR failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/match-names", response_model=MatchNamesResponse)
def match_names_endpoint(req: MatchNamesRequest):
    """Fuzzy match recognized names against student list using thefuzz."""
    try:
        log.info(
            "match-names request: recognized_count=%s, student_count=%s, threshold=%s",
            len(req.recognized_names),
            len(req.student_names),
            req.threshold,
        )
        if req.recognized_names:
            log.info("match-names recognized_sample: %s", req.recognized_names[:5])
        if req.student_names:
            log.info("match-names student_sample: %s", req.student_names[:5])
        matches = match_names(
            req.recognized_names,
            req.student_names,
            threshold=req.threshold,
            fallback_min_score=req.fallback_min_score,
        )
        matched_count = sum(1 for m in matches if m.get("index", -1) >= 0)
        fallback_count = sum(1 for m in matches if m.get("fallback"))
        log.info("match-names response: matched=%s fallback=%s total=%s", matched_count, fallback_count, len(matches))
        if matched_count == 0 and matches:
            log.warning(
                "match-names: 0 matches for %s items. Check threshold (current=%s) or name format.",
                len(matches),
                req.threshold,
            )
        return MatchNamesResponse(
            matches=[MatchItem(**m) for m in matches]
        )
    except Exception as e:
        log.exception("match-names error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/image-hash", response_model=ImageHashResponse)
def image_hash(req: ImageHashRequest):
    """Compute perceptual hash (pHash) of image for later match-by-image. Uses same preprocessing as OCR (crop 35px right)."""
    try:
        import imagehash
        img = preprocess_for_ocr(req.image_base64)
        pil_img = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
        h = imagehash.phash(pil_img)
        return ImageHashResponse(hash=str(h))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.exception("image-hash failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


# Max Hamming distance to consider a match (pHash is 64 bits, 0-64)
MATCH_BY_IMAGE_MAX_DISTANCE = 10


@app.post("/match-by-image", response_model=MatchByImageResponse)
def match_by_image(req: MatchByImageRequest):
    """Match an image against stored samples by perceptual hash. Returns best student_index if within threshold."""
    try:
        import imagehash
        img = preprocess_for_ocr(req.image_base64)
        pil_img = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
        h = imagehash.phash(pil_img)
        best_index = -1
        best_distance = 999
        for s in req.samples:
            if not s.image_hash:
                continue
            try:
                sh = imagehash.hex_to_hash(s.image_hash)
                d = h - sh
                if d < best_distance:
                    best_distance = d
                    best_index = s.student_index
            except Exception:
                continue
        if best_index < 0 or best_distance > MATCH_BY_IMAGE_MAX_DISTANCE:
            return MatchByImageResponse(student_index=-1, score=0.0)
        score = max(0.0, 100.0 - best_distance * 5.0)
        return MatchByImageResponse(student_index=best_index, score=round(score, 1))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.exception("match-by-image failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
