"""
KisanSeva ML Inference Server — DINOv2 (ONNX Runtime)

FastAPI service serving the DINOv2-Small plant disease classifier via ONNX Runtime.
91.31% accuracy on 363 disease classes. CPU-only, ~90MB model.

Endpoints:
    POST /predict  - Accept an image, return top-5 predictions
    GET  /health   - Health check
    GET  /classes  - List all 363 class names
"""

import io
import json
import logging
import os
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import numpy as np
import onnxruntime as ort
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("kisanseva-ml")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
MODEL_DIR = os.environ.get(
    "MODEL_DIR",
    str(Path(__file__).resolve().parent / "models"),
)
ONNX_MODEL_PATH = os.path.join(MODEL_DIR, "best_model_dinov2.onnx")
CLASS_NAMES_PATH = os.path.join(MODEL_DIR, "class_names.json")

# ImageNet normalization constants (must match DINOv2 training preprocessing)
IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

IMAGE_SIZE = 224
TOP_K = 5

# ---------------------------------------------------------------------------
# Global state
# ---------------------------------------------------------------------------
ort_session: ort.InferenceSession | None = None
class_names: list[str] = []


MODEL_DATA_URL = os.environ.get(
    "MODEL_DATA_URL",
    "https://github.com/singhakan2635/kisanseva-ml-serve/releases/download/v1.0/best_model_dinov2.onnx.data",
)
MODEL_DATA_PATH = os.path.join(MODEL_DIR, "best_model_dinov2.onnx.data")


def download_model_data() -> None:
    """Download the ONNX weights file if not present."""
    if os.path.isfile(MODEL_DATA_PATH):
        logger.info("Model data already exists (%d MB)", os.path.getsize(MODEL_DATA_PATH) // (1024 * 1024))
        return

    import urllib.request
    logger.info("Downloading model weights from %s ...", MODEL_DATA_URL)
    os.makedirs(MODEL_DIR, exist_ok=True)
    urllib.request.urlretrieve(MODEL_DATA_URL, MODEL_DATA_PATH)
    logger.info("Downloaded model data: %d MB", os.path.getsize(MODEL_DATA_PATH) // (1024 * 1024))


def load_model() -> None:
    """Load the ONNX model and class names."""
    global ort_session, class_names

    # Download weights if needed
    download_model_data()

    if not os.path.isfile(ONNX_MODEL_PATH):
        logger.error("ONNX model not found at %s", ONNX_MODEL_PATH)
        raise FileNotFoundError(f"ONNX model not found: {ONNX_MODEL_PATH}")

    if not os.path.isfile(CLASS_NAMES_PATH):
        logger.error("Class names file not found at %s", CLASS_NAMES_PATH)
        raise FileNotFoundError(f"Class names file not found: {CLASS_NAMES_PATH}")

    # Load ONNX Runtime session (CPU only — no GPU needed for DINOv2-Small)
    ort_session = ort.InferenceSession(
        ONNX_MODEL_PATH,
        providers=["CPUExecutionProvider"],
    )
    logger.info("ONNX DINOv2 model loaded from %s", ONNX_MODEL_PATH)

    # Load class names (simple list of 363 names)
    with open(CLASS_NAMES_PATH, "r") as f:
        class_names = json.load(f)
    logger.info("Loaded %d disease classes", len(class_names))


def preprocess_image(image: Image.Image) -> np.ndarray:
    """
    Preprocess an image for DINOv2 inference (matches training pipeline).

    Pipeline:
        1. Resize shorter edge to 256
        2. Center crop to 224x224
        3. Convert to float32, scale to [0, 1]
        4. Normalize with ImageNet mean/std
        5. Transpose to NCHW format
    """
    width, height = image.size
    if width < height:
        new_width = 256
        new_height = int(256 * height / width)
    else:
        new_height = 256
        new_width = int(256 * width / height)
    image = image.resize((new_width, new_height), Image.BILINEAR)

    # Center crop to 224x224
    left = (new_width - IMAGE_SIZE) // 2
    top = (new_height - IMAGE_SIZE) // 2
    image = image.crop((left, top, left + IMAGE_SIZE, top + IMAGE_SIZE))

    # Convert to numpy float32 and normalize
    img_array = np.array(image, dtype=np.float32) / 255.0
    img_array = (img_array - IMAGENET_MEAN) / IMAGENET_STD

    # HWC -> CHW, add batch dimension -> NCHW
    img_array = np.transpose(img_array, (2, 0, 1))
    img_array = np.expand_dims(img_array, axis=0)

    return img_array


def softmax(logits: np.ndarray) -> np.ndarray:
    """Compute softmax probabilities from raw logits."""
    exp_logits = np.exp(logits - np.max(logits, axis=-1, keepdims=True))
    return exp_logits / np.sum(exp_logits, axis=-1, keepdims=True)


def parse_class_name(raw: str) -> dict[str, Any]:
    """Parse a class name like 'Apple_Apple_Scab' into crop, disease, healthy."""
    parts = raw.replace("___", "_").replace("__", "_").split("_")
    parts = [p for p in parts if p]
    crop = parts[0] if parts else "Unknown"
    disease = " ".join(parts[1:]) if len(parts) > 1 else "Unknown"
    is_healthy = "healthy" in raw.lower()
    if is_healthy:
        disease = "Healthy"
    return {"crop": crop, "disease": disease, "healthy": is_healthy}


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load the model on startup."""
    load_model()
    yield


app = FastAPI(
    title="KisanSeva DINOv2 Disease Classifier (ONNX)",
    description="Plant disease detection — 363 classes, 91.31% accuracy",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    """Health check endpoint — compatible with Node.js backend expectations."""
    return {
        "status": "healthy",
        "model": "dinov2-small-onnx",
        "model_loaded": ort_session is not None,
        "num_classes": len(class_names),
    }


@app.get("/classes")
async def list_classes():
    """Return all 363 class names with crop/disease info."""
    result = []
    for name in class_names:
        info = parse_class_name(name)
        result.append({
            "class_name": name,
            "crop": info["crop"],
            "disease": info["disease"],
            "healthy": info["healthy"],
        })
    return {"classes": result, "total": len(result)}


@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    """
    Accept an image file and return top-5 disease predictions.

    Response shape matches what the Node.js backend expects:
        {
            "predictions": [
                {
                    "class_name": "Tomato_Late_Blight",
                    "crop": "Tomato",
                    "disease": "Late Blight",
                    "healthy": false,
                    "confidence": 95.42
                }, ...
            ],
            "inference_time_ms": 42.5
        }
    """
    if ort_session is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    # Read and validate image
    try:
        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read image: {e}")

    # Preprocess
    input_tensor = preprocess_image(image)

    # Run ONNX inference
    input_name = ort_session.get_inputs()[0].name  # "image"
    start_time = time.perf_counter()
    outputs = ort_session.run(None, {input_name: input_tensor})
    inference_time_ms = (time.perf_counter() - start_time) * 1000

    # Get probabilities
    logits = outputs[0][0]  # shape: (363,)
    probs = softmax(logits)

    # Top-K predictions
    top_indices = np.argsort(probs)[::-1][:TOP_K]
    predictions = []
    for idx in top_indices:
        raw = class_names[int(idx)]
        info = parse_class_name(raw)
        predictions.append({
            "class_name": raw,
            "crop": info["crop"],
            "disease": info["disease"],
            "healthy": info["healthy"],
            "confidence": round(float(probs[idx]) * 100, 2),
        })

    logger.info(
        "Prediction: %s (%.1f%%) in %.1f ms",
        predictions[0]["class_name"],
        predictions[0]["confidence"],
        inference_time_ms,
    )

    return {
        "predictions": predictions,
        "inference_time_ms": round(inference_time_ms, 1),
    }


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("ML_PORT", "8000"))
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=False)
