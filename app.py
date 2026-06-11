from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from render_service import render_tikz_to_png

app = FastAPI(title="LHL TikZ Render Backend", version="V103A6")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TikzRequest(BaseModel):
    tikz: str = Field(..., description="TikZ code or tikzpicture block")
    format: str = Field("png", description="png is recommended; svg kept for compatibility")
    engine: str = Field("xelatex", description="xelatex or lualatex")
    timeout_seconds: int = Field(30, ge=5, le=60)
    dpi: int = Field(300, ge=120, le=600)


@app.get("/")
def root():
    return {
        "ok": True,
        "name": "LHL TikZ Render Backend",
        "version": "V103A6",
        "endpoint": "/render-tikz",
        "format": "png",
    }


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/render-tikz")
def render_tikz(req: TikzRequest):
    # V103A6 ưu tiên PNG để LHL Tool hiển thị chắc chắn trong preview.
    return render_tikz_to_png(
        tikz=req.tikz,
        engine=req.engine,
        timeout_seconds=req.timeout_seconds,
        dpi=req.dpi,
    )
