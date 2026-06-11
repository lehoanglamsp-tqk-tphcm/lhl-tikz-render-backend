from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from render_service import render_tikz_to_svg

app = FastAPI(title="LHL TikZ Render Backend", version="V103A3")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TikzRequest(BaseModel):
    tikz: str = Field(..., description="TikZ code or tikzpicture block")
    format: str = Field("svg", description="Currently only svg is supported")
    engine: str = Field("xelatex", description="xelatex or lualatex")
    timeout_seconds: int = Field(20, ge=5, le=40)


@app.get("/")
def root():
    return {
        "ok": True,
        "name": "LHL TikZ Render Backend",
        "version": "V103A3",
        "endpoint": "/render-tikz",
    }


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/render-tikz")
def render_tikz(req: TikzRequest):
    if req.format.lower() != "svg":
        return {"ok": False, "error": "V103A hiện chỉ hỗ trợ format SVG.", "log": ""}

    return render_tikz_to_svg(
        tikz=req.tikz,
        engine=req.engine,
        timeout_seconds=req.timeout_seconds,
    )
