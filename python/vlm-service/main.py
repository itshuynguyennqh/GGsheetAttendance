"""FastAPI VLM service: OCR chữ viết học sinh — OpenVINO (Qwen2-VL) hoặc Google Gemini."""
import base64
import logging
import sys
import tempfile
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from schemas import (
    OcrRequest,
    OcrResponse,
    MatchNamesRequest,
    MatchNamesResponse,
    MatchItem,
    OcrMatchRequest,
    OcrMatchResponse,
)
from prompts import ocr_prompt, ocr_match_prompt
from matcher import match_names, find_best_match

# Chọn engine: VLM_ENGINE=gemini | gemma | openvino
# gemini = Gemini 3.1 Flash Lite (mặc định), gemma = Gemma 3 27B, openvino = Qwen2-VL local
VLM_ENGINE = (os.environ.get("VLM_ENGINE") or "openvino").strip().lower()
if VLM_ENGINE == "gemma":
    os.environ.setdefault("GEMINI_MODEL", "gemma-3-27b-it")
if VLM_ENGINE in ("gemini", "gemma"):
    from gemini_engine import ensure_pipeline_loaded, warmup, recognize, GEMINI_MODEL as VLM_MODEL_PATH
else:
    from vlm_engine import ensure_pipeline_loaded, warmup, recognize, VLM_MODEL_PATH

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s [%(name)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    stream=sys.stdout,
)
log = logging.getLogger("vlm_service")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Pre-load VLM model and warm-up so first request doesn't lag."""
    import asyncio

    log.info("VLM engine: %s, model: %s", VLM_ENGINE, VLM_MODEL_PATH)
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, ensure_pipeline_loaded)
    await loop.run_in_executor(None, warmup)
    log.info("VLM service ready")
    yield


app = FastAPI(title="VLM Service", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


CROP_RIGHT_PX = int(os.environ.get("CROP_RIGHT_PX", "35"))


def _decode_base64_to_tempfile(image_base64: str) -> str:
    """Decode base64 image, crop right edge to remove 'Lớp' noise, write to temp file."""
    from PIL import Image
    import io

    raw = image_base64
    if "," in raw:
        raw = raw.split(",", 1)[1]
    data = base64.b64decode(raw)

    img = Image.open(io.BytesIO(data)).convert("RGB")
    w, h = img.size
    if CROP_RIGHT_PX > 0 and w > CROP_RIGHT_PX:
        img = img.crop((0, 0, w - CROP_RIGHT_PX, h))

    fd, path = tempfile.mkstemp(suffix=".jpg")
    with os.fdopen(fd, "wb") as f:
        img.save(f, format="JPEG", quality=95)
    return path


@app.get("/health")
def health():
    return {"ok": True, "engine": VLM_ENGINE}


@app.post("/ocr", response_model=OcrResponse)
def ocr(req: OcrRequest):
    """Decode base64 image, run VLM inference, return recognized text."""
    tmp_path = None
    try:
        tmp_path = _decode_base64_to_tempfile(req.image_base64)
        prompt = ocr_prompt(req.language or "vi")
        text = recognize(tmp_path, prompt)
        return OcrResponse(text=text or "")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.exception("VLM OCR failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


@app.post("/match-names", response_model=MatchNamesResponse)
def match_names_endpoint(req: MatchNamesRequest):
    """Fuzzy match recognized names against student list (same as ocr-service)."""
    try:
        log.info(
            "match-names: recognized=%d, students=%d, threshold=%d",
            len(req.recognized_names),
            len(req.student_names),
            req.threshold,
        )
        matches = match_names(
            req.recognized_names,
            req.student_names,
            threshold=req.threshold,
            fallback_min_score=req.fallback_min_score,
        )
        matched_count = sum(1 for m in matches if m.get("index", -1) >= 0)
        log.info("match-names result: matched=%d/%d", matched_count, len(matches))
        return MatchNamesResponse(matches=[MatchItem(**m) for m in matches])
    except Exception as e:
        log.exception("match-names error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ocr-match", response_model=OcrMatchResponse)
def ocr_match(req: OcrMatchRequest):
    """
    Combined OCR + match in one VLM pass.
    The student list is embedded in the prompt so the VLM constrains its output
    to real names (in-context learning). Falls back to fuzzy matching for scoring.
    """
    tmp_path = None
    try:
        tmp_path = _decode_base64_to_tempfile(req.image_base64)

        prompt = ocr_match_prompt(req.student_names, req.language or "vi")
        vlm_text = recognize(tmp_path, prompt)
        log.info("ocr-match VLM output: %r", vlm_text)

        if not vlm_text:
            return OcrMatchResponse(text="", matched="", index=-1, score=0.0)

        # Check if VLM output is an exact match in the student list
        for i, name in enumerate(req.student_names):
            if vlm_text.strip().lower() == name.strip().lower():
                return OcrMatchResponse(
                    text=vlm_text, matched=name, index=i, score=100.0
                )

        # Fuzzy match the VLM output against the student list for best match + score
        best = find_best_match(
            vlm_text,
            req.student_names,
            threshold=req.threshold,
            fallback_min_score=req.fallback_min_score,
        )
        if best:
            return OcrMatchResponse(
                text=vlm_text,
                matched=best["matched"],
                index=best["index"],
                score=best["score"],
                fallback=best.get("fallback", False),
            )

        return OcrMatchResponse(text=vlm_text, matched="", index=-1, score=0.0)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.exception("ocr-match failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
