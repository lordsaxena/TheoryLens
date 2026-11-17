"""TheoryLens backend: FastAPI + NVIDIA NIM + CUDA/NumPy benchmark."""
from __future__ import annotations

import base64
import json
import logging
import os
import re
import time
from typing import Any, Literal

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel, Field, model_validator

load_dotenv()
log = logging.getLogger("theorylens")

NIM_BASE_URL = "https://integrate.api.nvidia.com/v1"
TEXT_MODEL = "nvidia/llama-3.3-nemotron-super-49b-v1"
VISION_MODEL = "nvidia/nemotron-nano-12b-v2-vl"
MAX_IMAGE_BYTES = 8 * 1024 * 1024

# --------------------------------------------------------------------------- #
# Schema
# --------------------------------------------------------------------------- #


class Parameter(BaseModel):
    id: str
    label: str
    min: float
    max: float
    step: float
    default: float
    unit: str = ""

    @model_validator(mode="after")
    def _sane(self) -> "Parameter":
        if self.max <= self.min:
            self.max = self.min + 1.0
        if self.step <= 0:
            self.step = (self.max - self.min) / 100.0
        self.default = min(max(self.default, self.min), self.max)
        return self


class SceneObject(BaseModel):
    id: str
    shape: Literal["sphere", "box", "cone", "torus", "cylinder"] = "sphere"
    color: str = "#76b900"
    initial_position: list[float] = Field(min_length=3, max_length=3)
    formula_hint: str = ""


class Theory(BaseModel):
    title: str
    domain: str
    simulation_type: Literal["wave_field", "particle_kinematics", "vector_field"]
    summary: str
    equations: list[str]
    parameters: list[Parameter]
    objects: list[SceneObject]


class ParseRequest(BaseModel):
    text: str = Field(min_length=1, max_length=8000)


class ParseResponse(BaseModel):
    theory: Theory
    source: Literal["nvidia-nim", "fallback-preset"]
    model: str | None = None
    extracted_text: str | None = None


# --------------------------------------------------------------------------- #
# Pre-built presets (used whenever NVIDIA_API_KEY is missing or NIM fails)
# --------------------------------------------------------------------------- #

PRESETS: dict[str, dict[str, Any]] = {
    "oscillator": {
        "title": "Damped Harmonic Oscillator",
        "domain": "Classical Mechanics",
        "simulation_type": "particle_kinematics",
        "summary": (
            "A mass on a spring loses energy to friction. The restoring force pulls it back "
            "toward equilibrium while damping shrinks every swing. Light damping gives a "
            "decaying oscillation, heavy damping stops it from oscillating at all."
        ),
        "equations": [
            "m x'' + b x' + k x = 0",
            "x(t) = A e^(-γt) cos(ω_d t),  γ = b / 2m",
            "ω_d = √(k/m − γ²)",
        ],
        "parameters": [
            {"id": "mass", "label": "Mass (m)", "min": 0.5, "max": 5, "step": 0.1, "default": 1, "unit": "kg"},
            {"id": "stiffness", "label": "Spring constant (k)", "min": 1, "max": 40, "step": 0.5, "default": 12, "unit": "N/m"},
            {"id": "damping", "label": "Damping coefficient (b)", "min": 0, "max": 6, "step": 0.1, "default": 0.6, "unit": "kg/s"},
            {"id": "amplitude", "label": "Initial displacement (A)", "min": 0.5, "max": 3, "step": 0.1, "default": 2, "unit": "m"},
        ],
        "objects": [
            {"id": "anchor", "shape": "box", "color": "#64748b", "initial_position": [-4, 0, 0], "formula_hint": "Fixed wall (spring anchor)"},
            {"id": "mass", "shape": "sphere", "color": "#76b900", "initial_position": [0, 0, 0], "formula_hint": "x(t) = A·e^(−γt)·cos(ω_d·t)"},
        ],
    },
    "orbit": {
        "title": "Orbital Gravity Well",
        "domain": "Celestial Mechanics",
        "simulation_type": "vector_field",
        "summary": (
            "A massive body bends the space around it into a gravity well. The arrows show the "
            "gravitational field pointing inward and weakening with distance squared, while "
            "orbiting bodies follow Kepler ellipses around the central mass."
        ),
        "equations": [
            "g(r) = −G M / r²  (r̂)",
            "T² = 4π² a³ / (G M)",
            "r(θ) = a(1 − e²) / (1 + e cos θ)",
        ],
        "parameters": [
            {"id": "central_mass", "label": "Central mass (M)", "min": 1, "max": 50, "step": 1, "default": 10, "unit": "M☉"},
            {"id": "orbit_radius", "label": "Semi-major axis (a)", "min": 3, "max": 9, "step": 0.1, "default": 5, "unit": "AU"},
            {"id": "eccentricity", "label": "Eccentricity (e)", "min": 0, "max": 0.8, "step": 0.01, "default": 0.2, "unit": ""},
            {"id": "time_scale", "label": "Time scale", "min": 0.2, "max": 3, "step": 0.1, "default": 1.5, "unit": "×"},
        ],
        "objects": [
            {"id": "star", "shape": "sphere", "color": "#fbbf24", "initial_position": [0, 0, 0], "formula_hint": "g(r) = −GM/r²"},
            {"id": "planet", "shape": "sphere", "color": "#38bdf8", "initial_position": [5, 0, 0], "formula_hint": "r(θ) = a(1−e²)/(1+e·cosθ)"},
            {"id": "comet", "shape": "cone", "color": "#f472b6", "initial_position": [7, 0, 0], "formula_hint": "T ∝ a^(3/2)  (Kepler's third law)"},
        ],
    },
    "wave": {
        "title": "3D Wave Interference",
        "domain": "Wave Physics",
        "simulation_type": "wave_field",
        "summary": (
            "Two point sources emit circular waves that overlap. Where crests meet crests the "
            "surface rises (constructive interference), and where crests meet troughs it "
            "cancels (destructive interference), producing the familiar interference fringes."
        ),
        "equations": [
            "ψ(r, t) = Σᵢ A sin(k rᵢ − ωt)",
            "k = 2π/λ,  ω = 2πf",
            "Constructive: Δr = nλ   Destructive: Δr = (n + ½)λ",
        ],
        "parameters": [
            {"id": "amplitude", "label": "Amplitude (A)", "min": 0.2, "max": 1.5, "step": 0.05, "default": 0.6, "unit": "m"},
            {"id": "wavelength", "label": "Wavelength (λ)", "min": 1, "max": 6, "step": 0.1, "default": 2.5, "unit": "m"},
            {"id": "frequency", "label": "Frequency (f)", "min": 0.2, "max": 3, "step": 0.05, "default": 1, "unit": "Hz"},
            {"id": "separation", "label": "Source separation (d)", "min": 0, "max": 10, "step": 0.1, "default": 5, "unit": "m"},
        ],
        "objects": [
            {"id": "source_a", "shape": "sphere", "color": "#76b900", "initial_position": [-2.5, 0.3, 0], "formula_hint": "ψ₁ = A sin(k r₁ − ωt)"},
            {"id": "source_b", "shape": "sphere", "color": "#38bdf8", "initial_position": [2.5, 0.3, 0], "formula_hint": "ψ₂ = A sin(k r₂ − ωt)"},
        ],
    },
}


def pick_preset(text: str) -> str:
    t = text.lower()
    if re.search(r"orbit|gravit|kepler|newton|planet|celestial", t):
        return "orbit"
    if re.search(r"wave|interfer|diffract|young|slit|superposition|ripple", t):
        return "wave"
    return "oscillator"


def fallback_response(text: str, extracted: str | None = None) -> ParseResponse:
    return ParseResponse(
        theory=Theory.model_validate(PRESETS[pick_preset(text)]),
        source="fallback-preset",
        model=None,
        extracted_text=extracted,
    )


# --------------------------------------------------------------------------- #
# NVIDIA NIM (OpenAI-compatible)
# --------------------------------------------------------------------------- #


def nim_enabled() -> bool:
    key = (os.getenv("NVIDIA_API_KEY") or "").strip()
    return bool(key) and key != "your_key_here"


def get_client() -> OpenAI:
    return OpenAI(base_url=NIM_BASE_URL, api_key=os.getenv("NVIDIA_API_KEY"), timeout=60.0)


PROMPT = """You convert a scientific theory, concept or equation into a JSON simulation spec.
Reply with ONE JSON object only. No markdown, no commentary.

Schema:
{
  "title": str, "domain": str,
  "simulation_type": "wave_field" | "particle_kinematics" | "vector_field",
  "summary": str (2-3 plain-English sentences),
  "equations": [str],
  "parameters": [{"id": str, "label": str, "min": num, "max": num, "step": num, "default": num, "unit": str}],
  "objects": [{"id": str, "shape": "sphere"|"box"|"cone"|"torus"|"cylinder", "color": "#rrggbb",
               "initial_position": [x, y, z], "formula_hint": str}]
}

The renderer only understands these parameter ids, so use them exactly:
- wave_field: amplitude, wavelength, frequency, separation. Objects are wave sources (use 2).
- particle_kinematics (spring): mass, stiffness, damping, amplitude. Objects: one with id "anchor"
  at [-4,0,0] and one moving mass at [0,0,0].
- particle_kinematics (orbit) or vector_field: central_mass, orbit_radius, eccentricity (0-0.8), time_scale.
  The FIRST object is the central body at [0,0,0]; the others orbit it.
Keep scene coordinates within about -8..8. Equations are plain-text strings.

Theory:
"""


def extract_json(raw: str) -> dict[str, Any]:
    raw = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL)
    start, end = raw.find("{"), raw.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("model returned no JSON object")
    return json.loads(raw[start : end + 1])


def nim_parse_theory(text: str) -> Theory:
    resp = get_client().chat.completions.create(
        model=TEXT_MODEL,
        messages=[
            {"role": "system", "content": "detailed thinking off"},
            {"role": "user", "content": PROMPT + text},
        ],
        temperature=0.2,
        max_tokens=2048,
    )
    return Theory.model_validate(extract_json(resp.choices[0].message.content or ""))


def nim_extract_from_image(data: bytes, mime: str) -> str:
    b64 = base64.b64encode(data).decode("ascii")
    resp = get_client().chat.completions.create(
        model=VISION_MODEL,
        messages=[
            {"role": "system", "content": "/no_think"},
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "Transcribe every equation and the key scientific concept in this "
                            "image as plain text. Include variable definitions if visible."
                        ),
                    },
                    {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
                ],
            },
        ],
        temperature=0.1,
        max_tokens=1024,
    )
    return (resp.choices[0].message.content or "").strip()


def parse_text(text: str, extracted: str | None = None) -> ParseResponse:
    if not nim_enabled():
        return fallback_response(text, extracted)
    try:
        return ParseResponse(
            theory=nim_parse_theory(text),
            source="nvidia-nim",
            model=TEXT_MODEL,
            extracted_text=extracted,
        )
    except Exception as exc:  # network, auth, bad JSON, schema mismatch
        log.warning("NIM parse failed, using preset: %s", exc)
        return fallback_response(text, extracted)


# --------------------------------------------------------------------------- #
# App
# --------------------------------------------------------------------------- #

app = FastAPI(title="TheoryLens API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"ok": True, "nim_enabled": nim_enabled(), "text_model": TEXT_MODEL, "vision_model": VISION_MODEL}


@app.post("/api/parse-theory", response_model=ParseResponse)
def parse_theory(req: ParseRequest) -> ParseResponse:
    return parse_text(req.text)


@app.post("/api/parse-image", response_model=ParseResponse)
def parse_image(file: UploadFile = File(...), context: str = Form("")) -> ParseResponse:
    mime = file.content_type or ""
    if not mime.startswith("image/"):
        raise HTTPException(status_code=400, detail="Upload must be an image.")
    data = file.file.read()
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image larger than 8 MB.")

    if not nim_enabled():
        return fallback_response(
            context or "damped harmonic oscillator",
            "Demo mode (no NVIDIA_API_KEY): showing a preset instead of reading your image.",
        )
    try:
        extracted = nim_extract_from_image(data, mime)
    except Exception as exc:
        log.warning("NIM vision failed, using preset: %s", exc)
        return fallback_response(context or "damped harmonic oscillator", None)
    combined = f"{extracted}\n\nUser note: {context}".strip() if context else extracted
    return parse_text(combined, extracted)


# --------------------------------------------------------------------------- #
# GPU benchmark
# --------------------------------------------------------------------------- #

try:
    import cupy as cp  # type: ignore[import-not-found]

    cp.cuda.runtime.getDeviceCount()  # raises if no CUDA device/driver
    GPU_AVAILABLE = True
    GPU_NAME = cp.cuda.runtime.getDeviceProperties(0)["name"].decode()
except ImportError:
    cp = None
    GPU_AVAILABLE, GPU_NAME = False, None
except Exception:  # cupy installed but no usable CUDA device
    cp = None
    GPU_AVAILABLE, GPU_NAME = False, None

import numpy as np  # noqa: E402


def simulate_grid(xp: Any, n: int, steps: int) -> float:
    """Two-source wave field with diffusion-style smoothing on an n x n grid."""
    ax = xp.linspace(-10.0, 10.0, n, dtype=xp.float32)
    x, y = xp.meshgrid(ax, ax)
    r1 = xp.sqrt((x + 3.0) ** 2 + y**2)
    r2 = xp.sqrt((x - 3.0) ** 2 + y**2)
    u = xp.zeros((n, n), dtype=xp.float32)
    for s in range(steps):
        t = 0.05 * s
        src = xp.sin(2.0 * r1 - 3.0 * t) / (1.0 + r1) + xp.sin(2.0 * r2 - 3.0 * t) / (1.0 + r2)
        lap = xp.roll(u, 1, 0) + xp.roll(u, -1, 0) + xp.roll(u, 1, 1) + xp.roll(u, -1, 1) - 4.0 * u
        u = u + 0.2 * lap + 0.05 * src
    return float(xp.sum(u))  # forces device sync


@app.get("/api/benchmark")
def benchmark(
    n: int = Query(1024, ge=128, le=4096),
    steps: int = Query(40, ge=1, le=400),
) -> dict[str, Any]:
    t0 = time.perf_counter()
    simulate_grid(np, n, steps)
    cpu_ms = (time.perf_counter() - t0) * 1000.0

    if GPU_AVAILABLE and cp is not None:
        simulate_grid(cp, 256, 2)  # warm-up: kernel compile + context init
        cp.cuda.Stream.null.synchronize()
        t0 = time.perf_counter()
        simulate_grid(cp, n, steps)
        cp.cuda.Stream.null.synchronize()
        gpu_ms = (time.perf_counter() - t0) * 1000.0
        backend = "cupy-cuda"
    else:
        gpu_ms, backend = cpu_ms, "numpy-fallback"

    return {
        "gpu_ms": round(gpu_ms, 2),
        "cpu_ms": round(cpu_ms, 2),
        "speedup_factor": round(cpu_ms / gpu_ms, 2) if gpu_ms > 0 else 1.0,
        "gpu_available": GPU_AVAILABLE,
        "backend": backend,
        "device": GPU_NAME or "CPU (NumPy)",
        "grid_size": n,
        "steps": steps,
    }