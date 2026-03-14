"""VLM engine: Qwen2-VL-2B via OpenVINO GenAI for handwriting recognition."""
import logging
import os
import threading
import time
from typing import Optional

log = logging.getLogger(__name__)

VLM_MODEL_PATH = os.environ.get(
    "VLM_MODEL_PATH", "helenai/Qwen2-VL-2B-Instruct-ov-int4"
).strip()
VLM_DEVICE = os.environ.get("VLM_DEVICE", "CPU").strip().upper()
VLM_MAX_NEW_TOKENS = int(os.environ.get("VLM_MAX_NEW_TOKENS", "50"))

_pipeline: Optional[object] = None
_pipeline_lock = threading.Lock()


def _resolve_model_path(model_id: str) -> str:
    """
    Resolve model path: if it's already a local directory, use it directly.
    If it looks like a HuggingFace repo ID (org/name), download via huggingface_hub.
    """
    if os.path.isdir(model_id):
        log.info("Using local model directory: %s", model_id)
        return model_id

    if "/" in model_id and not os.path.exists(model_id):
        from huggingface_hub import snapshot_download
        log.info("Downloading model from HuggingFace: %s (this may take a few minutes)...", model_id)
        local_dir = snapshot_download(repo_id=model_id)
        log.info("Model downloaded to: %s", local_dir)
        return local_dir

    return model_id


def _load_pipeline():
    """Load OpenVINO GenAI VLMPipeline. Called once with thread-safe lock."""
    import openvino_genai as ov_genai

    local_path = _resolve_model_path(VLM_MODEL_PATH)
    log.info("Loading VLM model: %s on %s ...", local_path, VLM_DEVICE)
    start = time.time()
    pipe = ov_genai.VLMPipeline(local_path, VLM_DEVICE)
    elapsed = time.time() - start
    log.info("VLM model loaded in %.1fs", elapsed)
    return pipe


def get_pipeline():
    """Lazy-load and return the VLMPipeline singleton (thread-safe)."""
    global _pipeline
    if _pipeline is not None:
        return _pipeline
    with _pipeline_lock:
        if _pipeline is None:
            _pipeline = _load_pipeline()
    return _pipeline


def ensure_pipeline_loaded() -> None:
    """Pre-load the pipeline at startup so first request doesn't lag."""
    get_pipeline()


def _pil_to_ov_tensor(pil_img):
    """Convert a PIL Image to an ov.Tensor with shape [1, H, W, C] for VLMPipeline."""
    import openvino as ov
    import numpy as np

    rgb = pil_img.convert("RGB")
    arr = np.array(rgb)[np.newaxis]  # [1, H, W, 3]
    return ov.Tensor(arr)


def warmup() -> None:
    """Run a dummy inference to warm up the compiled model."""
    from PIL import Image

    pipe = get_pipeline()
    dummy = Image.new("RGB", (100, 32), color=(255, 255, 255))
    ov_image = _pil_to_ov_tensor(dummy)
    log.info("VLM warm-up: running dummy inference...")
    start = time.time()
    pipe.generate("What is in this image?", images=[ov_image], max_new_tokens=5)
    log.info("VLM warm-up done in %.1fs", time.time() - start)


def recognize(image_path_or_pil, prompt: str, max_new_tokens: Optional[int] = None) -> str:
    """
    Run VLM inference on an image with the given prompt.

    Args:
        image_path_or_pil: file path (str) or PIL.Image.Image
        prompt: the text prompt for the VLM
        max_new_tokens: override default max tokens

    Returns:
        Generated text string.
    """
    from PIL import Image

    pipe = get_pipeline()
    tokens = max_new_tokens or VLM_MAX_NEW_TOKENS

    if isinstance(image_path_or_pil, str):
        pil_img = Image.open(image_path_or_pil).convert("RGB")
    elif isinstance(image_path_or_pil, Image.Image):
        pil_img = image_path_or_pil.convert("RGB")
    else:
        pil_img = Image.fromarray(image_path_or_pil).convert("RGB")

    ov_image = _pil_to_ov_tensor(pil_img)

    start = time.time()
    result = pipe.generate(prompt, images=[ov_image], max_new_tokens=tokens)
    elapsed = time.time() - start
    log.info("VLM inference: %.2fs, tokens=%d", elapsed, tokens)

    text = result if isinstance(result, str) else str(result)
    return text.strip()
