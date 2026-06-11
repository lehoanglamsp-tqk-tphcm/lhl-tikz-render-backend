from __future__ import annotations

import base64
import hashlib
import subprocess
import tempfile
from pathlib import Path
from typing import Dict, Any

from security import validate_tikz_code

CACHE_DIR = Path(__file__).resolve().parent / "cache"
CACHE_DIR.mkdir(exist_ok=True)

PREAMBLE_VERSION = "lhl-v103a6-png-300dpi-2026-06-11"


def normalize_tikz_body(tikz: str) -> str:
    code = (tikz or "").strip()
    if not code:
        return ""

    has_begin = r"\begin{tikzpicture}" in code
    has_end = r"\end{tikzpicture}" in code

    if has_begin and has_end:
        return code

    return "\\begin{tikzpicture}\n" + code + "\n\\end{tikzpicture}"


def wrap_standalone_tex(tikz: str) -> str:
    body = normalize_tikz_body(tikz)
    return r"""\documentclass[tikz,border=2pt]{standalone}

\usepackage{tikz}
\usepackage{tkz-euclide}
\usepackage{tkz-tab}
\usepackage{amsmath,amssymb}
\usepackage{graphicx}
\usepackage{xcolor}
\usepackage{array}
\usepackage{multirow}

\usetikzlibrary{
  calc,
  angles,
  quotes,
  intersections,
  arrows,
  arrows.meta,
  decorations.pathreplacing,
  decorations.markings,
  decorations.pathmorphing,
  patterns,
  positioning,
  shapes.geometric,
  through,
  backgrounds,
  fit
}

\begin{document}
""" + "\n" + body + "\n" + r"""
\end{document}
"""


def cache_key(tikz: str, engine: str, fmt: str, dpi: int) -> str:
    h = hashlib.sha256()
    h.update(PREAMBLE_VERSION.encode("utf-8"))
    h.update(b"\n")
    h.update(engine.encode("utf-8"))
    h.update(b"\n")
    h.update(fmt.encode("utf-8"))
    h.update(b"\n")
    h.update(str(dpi).encode("utf-8"))
    h.update(b"\n")
    h.update((tikz or "").encode("utf-8"))
    return h.hexdigest()


def short_log(text: str, limit: int = 8000) -> str:
    text = text or ""
    if len(text) <= limit:
        return text
    return text[-limit:]


def render_tikz_to_png(tikz: str, engine: str = "xelatex", timeout_seconds: int = 30, dpi: int = 300) -> Dict[str, Any]:
    ok, err = validate_tikz_code(tikz)
    if not ok:
        return {"ok": False, "error": err, "log": ""}

    engine = engine if engine in {"xelatex", "lualatex"} else "xelatex"
    dpi = int(dpi or 300)
    if dpi < 120:
        dpi = 120
    if dpi > 600:
        dpi = 600

    key = cache_key(tikz, engine, "png", dpi)
    cached_png = CACHE_DIR / f"{key}.png"

    if cached_png.exists():
        return {
            "ok": True,
            "format": "png",
            "mime": "image/png",
            "image_base64": base64.b64encode(cached_png.read_bytes()).decode("ascii"),
            "cached": True,
            "log": "",
        }

    with tempfile.TemporaryDirectory(prefix="lhl_tikz_png_") as tmp:
        tmp_path = Path(tmp)
        tex_path = tmp_path / "main.tex"
        pdf_path = tmp_path / "main.pdf"
        png_path = tmp_path / "output.png"

        tex_path.write_text(wrap_standalone_tex(tikz), encoding="utf-8")

        try:
            # standalone sẽ tạo PDF đã crop sát hình TikZ.
            p1 = subprocess.run(
                [engine, "-interaction=nonstopmode", "-halt-on-error", "main.tex"],
                cwd=tmp_path,
                capture_output=True,
                text=True,
                timeout=timeout_seconds,
            )

            if p1.returncode != 0 or not pdf_path.exists():
                return {
                    "ok": False,
                    "error": "Biên dịch LaTeX thất bại.",
                    "log": short_log((p1.stdout or "") + "\n" + (p1.stderr or "")),
                }

            # Ưu tiên pdftocairo từ poppler-utils: không phụ thuộc dvisvgm/Ghostscript.
            p2 = subprocess.run(
                ["pdftocairo", "-png", "-singlefile", "-r", str(dpi), "main.pdf", "output"],
                cwd=tmp_path,
                capture_output=True,
                text=True,
                timeout=timeout_seconds,
            )

            if p2.returncode != 0 or not png_path.exists():
                # Dự phòng bằng mutool nếu pdftocairo lỗi.
                p3 = subprocess.run(
                    ["mutool", "draw", "-r", str(dpi), "-o", "output.png", "main.pdf"],
                    cwd=tmp_path,
                    capture_output=True,
                    text=True,
                    timeout=timeout_seconds,
                )
                if p3.returncode != 0 or not png_path.exists():
                    return {
                        "ok": False,
                        "error": "Chuyển PDF sang PNG thất bại.",
                        "log": short_log(
                            "pdftocairo:\n" + (p2.stdout or "") + "\n" + (p2.stderr or "") +
                            "\n\nmutool:\n" + (p3.stdout or "") + "\n" + (p3.stderr or "")
                        ),
                    }

            cached_png.write_bytes(png_path.read_bytes())

            return {
                "ok": True,
                "format": "png",
                "mime": "image/png",
                "image_base64": base64.b64encode(png_path.read_bytes()).decode("ascii"),
                "cached": False,
                "log": "",
            }

        except subprocess.TimeoutExpired:
            return {"ok": False, "error": f"TikZ render quá thời gian cho phép ({timeout_seconds}s).", "log": "Timeout"}
        except FileNotFoundError as e:
            return {"ok": False, "error": "Server chưa cài đủ LaTeX/pdftocairo/mutool.", "log": str(e)}
        except Exception as e:
            return {"ok": False, "error": "Lỗi không xác định khi render TikZ PNG.", "log": repr(e)}


# Giữ tên hàm cũ để app.py cũ vẫn gọi được.
def render_tikz_to_svg(tikz: str, engine: str = "xelatex", timeout_seconds: int = 30) -> Dict[str, Any]:
    return render_tikz_to_png(tikz=tikz, engine=engine, timeout_seconds=timeout_seconds, dpi=300)
