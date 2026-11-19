"""TheoryLens backend v2: NVIDIA NIM compiles a theory into a formula-driven 3D scene spec."""
from __future__ import annotations

import base64
import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Annotated, Any, Literal

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel, BeforeValidator, Field, field_validator, model_validator

load_dotenv()
logging.basicConfig(level=logging.INFO)
log = logging.getLogger("theorylens")

NIM_BASE_URL = "https://integrate.api.nvidia.com/v1"
TEXT_MODEL = "nvidia/llama-3.3-nemotron-super-49b-v1"
VISION_MODEL = "nvidia/nemotron-nano-12b-v2-vl"
MAX_IMAGE_BYTES = 8 * 1024 * 1024

PRESETS: dict[str, dict[str, Any]] = json.loads(
    (Path(__file__).parent / "presets.json").read_text(encoding="utf-8")
)

BUILTINS = {"t", "x", "y", "z", "r", "idx", "cnt", "u"}
FUNCS = {
    "sin", "cos", "tan", "asin", "acos", "atan", "atan2", "sinh", "cosh", "tanh", "exp", "log",
    "sqrt", "abs", "pow", "min", "max", "floor", "ceil", "sign", "hypot", "step", "kepler", "mod", "clamp",
}
CONSTS = {"pi", "e"}
RESERVED = BUILTINS | FUNCS | CONSTS

_SAFE = re.compile(r"[0-9A-Za-z_+\-*/^().,%\s]*")
_NUM = re.compile(r"(?<![\w.])(?:\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)")
_IMPLICIT = re.compile(r"\b1\s*[A-Za-z_(]|\)\s*[\w(]")
_IDENT = re.compile(r"[A-Za-z_]\w*")


def check_expr(expr: str, allowed: set[str], label: str) -> None:
    cleaned = expr.replace("Math.", "").replace("**", "^").replace("\u2212", "-").replace("π", "pi")
    if not cleaned.strip():
        raise ValueError(f"{label}: empty expression")
    if not _SAFE.fullmatch(cleaned):
        raise ValueError(f"{label}: illegal characters in {expr!r}")
    stripped = _NUM.sub("1", cleaned)
    if _IMPLICIT.search(stripped):
        raise ValueError(f"{label}: implicit multiplication in {expr!r}; write 2*x")
    for ident in _IDENT.findall(stripped):
        if ident not in allowed:
            raise ValueError(f"{label}: unknown name {ident!r} in {expr!r}")


def _to_str(v: Any) -> Any:
    return str(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else v


Expr = Annotated[str, BeforeValidator(_to_str)]


def _clean_id(v: str) -> str:
    v = re.sub(r"\W", "_", v.strip())
    if not v or v[0].isdigit():
        v = "p_" + v
    return v + "_p" if v in RESERVED else v


class Parameter(BaseModel):
    id: str
    label: str
    min: float
    max: float
    step: float
    default: float
    unit: str = ""

    @field_validator("id")
    @classmethod
    def _fix_id(cls, v: str) -> str:
        return _clean_id(v)

    @model_validator(mode="after")
    def _sane(self) -> "Parameter":
        if self.max <= self.min:
            self.max = self.min + 1.0
        if self.step <= 0:
            self.step = (self.max - self.min) / 100.0
        self.default = min(max(self.default, self.min), self.max)
        return self


class Derived(BaseModel):
    id: str
    expr: Expr

    @field_validator("id")
    @classmethod
    def _fix_id(cls, v: str) -> str:
        return _clean_id(v)


class SceneObject(BaseModel):
    id: str
    shape: Literal["sphere", "box", "cone", "torus", "cylinder"] = "sphere"
    color: str = "#76b900"
    initial_position: list[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0], min_length=3, max_length=3)
    formula_hint: str = ""
    motion: list[Expr] | None = Field(default=None, min_length=3, max_length=3)
    trail: bool = False
    glow: bool = False
    size: float = Field(default=1.0, gt=0, le=6)


class Link(BaseModel):
    source: str
    target: str
    kind: Literal["spring", "rod"] = "spring"


class Surface(BaseModel):
    height: Expr
    range: Expr = "1"
    size: float = Field(default=20.0, ge=6, le=40)
    low: str = "#082f49"
    high: str = "#76b900"


class Field3(BaseModel):
    fx: Expr
    fy: Expr
    fz: Expr
    extent: float = Field(default=6.0, ge=2, le=10)
    flow: bool = True


class Swarm(BaseModel):
    x: Expr
    y: Expr
    z: Expr
    count: int = 4000
    color_a: str = "#76b900"
    color_b: str = "#38bdf8"
    size: float = Field(default=0.15, gt=0, le=1)

    @field_validator("count")
    @classmethod
    def _clamp(cls, v: int) -> int:
        return min(max(v, 100), 12000)


class Theory(BaseModel):
    title: str
    domain: str
    simulation_type: Literal["wave_field", "particle_kinematics", "vector_field"]
    summary: str
    equations: list[str]
    parameters: list[Parameter] = Field(max_length=8)
    derived: list[Derived] = []
    objects: list[SceneObject] = []
    links: list[Link] = []
    surface: Surface | None = None
    field: Field3 | None = None
    swarm: Swarm | None = None

    @model_validator(mode="after")
    def _check(self) -> "Theory":
        allowed = {p.id for p in self.parameters} | {d.id for d in self.derived} | RESERVED
        for d in self.derived:
            check_expr(d.expr, allowed, f"derived {d.id}")
        for o in self.objects:
            if o.motion:
                for axis, e in zip("xyz", o.motion):
                    check_expr(e, allowed, f"{o.id}.{axis}")
        if self.surface:
            check_expr(self.surface.height, allowed, "surface.height")
            check_expr(self.surface.range, allowed, "surface.range")
        if self.field:
            for k in ("fx", "fy", "fz"):
                check_expr(getattr(self.field, k), allowed, f"field.{k}")
        if self.swarm:
            for k in ("x", "y", "z"):
                check_expr(getattr(self.swarm, k), allowed, f"swarm.{k}")
        if not (self.objects or self.surface or self.field or self.swarm):
            raise ValueError("scene is empty: add objects, a surface, a field or a swarm")
        ids = {o.id for o in self.objects}
        self.links = [l for l in self.links if l.source in ids and l.target in ids]
        return self


class ParseRequest(BaseModel):
    text: str = Field(min_length=1, max_length=8000)


class ParseResponse(BaseModel):
    theory: Theory
    source: Literal["nvidia-nim", "fallback-preset"]
    model: str | None = None
    extracted_text: str | None = None


for _name, _spec in PRESETS.items():
    try:
        Theory.model_validate(_spec)
    except Exception as exc:
        log.error("Preset %r is invalid: %s", _name, exc)


def pick_preset(text: str) -> str:
    t = text.lower()
    if re.search(r"orbit|gravit|kepler|newton|planet|celestial", t):
        return "orbit"
    if re.search(r"wave|interfer|diffract|slit|superposition|ripple", t):
        return "wave"
    if re.search(r"electric|charge|dipole|coulomb|field line|magnet", t):
        return "dipole"
    return "oscillator"


def fallback_response(text: str, extracted: str | None = None) -> ParseResponse:
    return ParseResponse(
        theory=Theory.model_validate(PRESETS[pick_preset(text)]),
        source="fallback-preset",
        model=None,
        extracted_text=extracted,
    )


def nim_enabled() -> bool:
    key = (os.getenv("NVIDIA_API_KEY") or "").strip()
    return bool(key) and key != "your_key_here"


def get_client() -> OpenAI:
    return OpenAI(base_url=NIM_BASE_URL, api_key=os.getenv("NVIDIA_API_KEY"), timeout=90.0)


RULES = """You are the simulation compiler for TheoryLens. Convert the user's scientific theory into ONE JSON
object (no markdown, no commentary) that a 3D engine animates in real time in the browser.

Schema (EXPR = a formula string):
{"title":str,"domain":str,"simulation_type":"wave_field"|"particle_kinematics"|"vector_field",
 "summary":str (2-3 plain-English sentences),"equations":[str],
 "parameters":[{"id":str,"label":str,"min":num,"max":num,"step":num,"default":num,"unit":str}],
 "derived":[{"id":str,"expr":EXPR}],
 "objects":[{"id":str,"shape":"sphere"|"box"|"cone"|"torus"|"cylinder","color":"#rrggbb",
             "initial_position":[x,y,z],"formula_hint":str,"motion":[EXPR,EXPR,EXPR] or null,
             "trail":bool,"glow":bool,"size":num}],
 "links":[{"source":objectId,"target":objectId,"kind":"spring"|"rod"}],
 "surface":null or {"height":EXPR,"range":EXPR,"size":20,"low":"#hex","high":"#hex"},
 "field":null or {"fx":EXPR,"fy":EXPR,"fz":EXPR,"extent":6,"flow":true},
 "swarm":null or {"x":EXPR,"y":EXPR,"z":EXPR,"count":6000,"color_a":"#hex","color_b":"#hex","size":0.15}}

Formula language: numbers, + - * / ^ ( ) %, functions sin cos tan asin acos atan atan2 sinh cosh tanh exp
log sqrt abs pow min max floor ceil sign hypot step(x) (1 if x>0 else 0) clamp(x,lo,hi) mod(a,b)
kepler(M,e) (eccentric anomaly), constants pi and e. Always write the * (2*x, never 2x). Use no other names
than: parameter ids, derived ids, and the scope variables below.
Scope variables: t = seconds (everywhere). surface: x, z, r=sqrt(x^2+z^2). field: x, y, z. swarm: idx (point
number), cnt (point count), u=idx/cnt in [0,1). y is UP. Keep everything within about |coordinate| <= 8.
"derived" entries are evaluated in order and may use parameters, t and earlier derived entries. Use them to
name intermediate quantities. They cannot use x, y, z, r, idx or u.
Use physically correct closed-form formulas. Combine objects (moving bodies), links (springs/rods),
surface (height field y=f(x,z,t), e.g. waves, membranes, potential wells), field (vector field with flowing
tracers) and swarm (thousands of animated points: helices, orbitals, particle beams, fluids) as the theory
needs. 2-6 parameters with sensible SI ranges whose defaults give a clearly visible animation.
simulation_type: wave_field if the surface is the main thing, vector_field if the field is, else
particle_kinematics. Parameter ids: lowercase letters, digits, underscore only.
"""


def build_prompt() -> str:
    def ex(k: str) -> str:
        return json.dumps(PRESETS[k], ensure_ascii=False, separators=(",", ":"))
    return f"{RULES}\nExample A:\n{ex('oscillator')}\n\nExample B:\n{ex('dipole')}\n\nNow convert this theory:\n"


def extract_json(raw: str) -> dict[str, Any]:
    raw = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL)
    start, end = raw.find("{"), raw.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("model returned no JSON object")
    return json.loads(raw[start:end + 1])


def nim_parse_theory(text: str) -> Theory:
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": "detailed thinking off"},
        {"role": "user", "content": build_prompt() + text},
    ]
    last_err = ""
    for _ in range(2):
        resp = get_client().chat.completions.create(
            model=TEXT_MODEL, messages=messages, temperature=0.2, max_tokens=3500
        )
        raw = resp.choices[0].message.content or ""
        try:
            return Theory.model_validate(extract_json(raw))
        except ValueError as exc:
            last_err = str(exc)[:900]
            log.warning("NIM output rejected: %s", last_err)
            messages += [
                {"role": "assistant", "content": raw[:3000]},
                {"role": "user", "content": f"That JSON was rejected: {last_err}\nReturn the corrected JSON object only."},
            ]
    raise ValueError(last_err)


def nim_extract_from_image(data: bytes, mime: str) -> str:
    b64 = base64.b64encode(data).decode("ascii")
    resp = get_client().chat.completions.create(
        model=VISION_MODEL,
        messages=[
            {"role": "system", "content": "/no_think"},
            {"role": "user", "content": [
                {"type": "text", "text": "Transcribe every equation and the key scientific concept in this image as plain text. Include variable definitions if visible."},
                {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
            ]},
        ],
        temperature=0.1,
        max_tokens=1024,
    )
    return (resp.choices[0].message.content or "").strip()


def parse_text(text: str, extracted: str | None = None) -> ParseResponse:
    if not nim_enabled():
        return fallback_response(text, extracted)
    try:
        return ParseResponse(theory=nim_parse_theory(text), source="nvidia-nim", model=TEXT_MODEL, extracted_text=extracted)
    except Exception as exc:
        log.warning("NIM parse failed, using preset: %s", exc)
        return fallback_response(text, extracted)


app = FastAPI(title="TheoryLens API", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
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
        return fallback_response(context or "damped harmonic oscillator", "Demo mode (no NVIDIA_API_KEY): showing a preset instead of reading your image.")
    try:
        extracted = nim_extract_from_image(data, mime)
    except Exception as exc:
        log.warning("NIM vision failed, using preset: %s", exc)
        return fallback_response(context or "damped harmonic oscillator", None)
    combined = f"{extracted}\n\nUser note: {context}".strip() if context else extracted
    return parse_text(combined, extracted)


try:
    import cupy as cp  # type: ignore[import-not-found]
    cp.cuda.runtime.getDeviceCount()
    GPU_AVAILABLE = True
    GPU_NAME = cp.cuda.runtime.getDeviceProperties(0)["name"].decode()
except ImportError:
    cp = None
    GPU_AVAILABLE, GPU_NAME = False, None
except Exception:
    cp = None
    GPU_AVAILABLE, GPU_NAME = False, None

import numpy as np  # noqa: E402


def simulate_grid(xp: Any, n: int, steps: int) -> float:
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
    return float(xp.sum(u))


@app.get("/api/benchmark")
def benchmark(n: int = Query(1024, ge=128, le=4096), steps: int = Query(40, ge=1, le=400)) -> dict[str, Any]:
    t0 = time.perf_counter()
    simulate_grid(np, n, steps)
    cpu_ms = (time.perf_counter() - t0) * 1000.0

    if GPU_AVAILABLE and cp is not None:
        simulate_grid(cp, 256, 2)
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
