from __future__ import annotations

import hashlib
import subprocess
import tempfile
from pathlib import Path
from typing import Dict, Any

from security import validate_tikz_code

CACHE_DIR = Path(__file__).resolve().parent / "cache"
CACHE_DIR.mkdir(exist_ok=True)

PREAMBLE_VERSION = "lhl-v103a2-arrows-2026-06-11"


def normalize_tikz_body(tikz: str) -> str:
    code = (tikz or "").strip()
    if not code:
        return ""

    # Hỗ trợ code TikZ cũ hay dùng trong đề Toán:
    # - >=stealth cần library arrows; backend đã nạp arrows.
    # - Một số nguồn sinh \tikzstyle vẫn để nguyên cho tương thích.
    # Không tự thay nội dung hình quá mạnh để tránh làm sai code của thầy.

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
\usepackage{fontspec}
\setmainfont{TeX Gyre Termes}

\usetikzlibrary{
  calc,
  angles,
  quotes,
  intersections,
  arrows,
  arrows.meta,
  decorations.pathreplacing,
  patterns,
  positioning,
  shapes.geometric
}

\begin{document}
""" + "\n" + body + "\n" + r"""
\end{document}
"""


def cache_key(tikz: str, engine: str) -> str:
    h = hashlib.sha256()
    h.update(PREAMBLE_VERSION.encode("utf-8"))
    h.update(b"\n")
    h.update(engine.encode("utf-8"))
    h.update(b"\n")
    h.update((tikz or "").encode("utf-8"))
    return h.hexdigest()


def short_log(text: str, limit: int = 8000) -> str:
    text = text or ""
    if len(text) <= limit:
        return text
    return text[-limit:]


def render_tikz_to_svg(tikz: str, engine: str = "xelatex", timeout_seconds: int = 20) -> Dict[str, Any]:
    ok, err = validate_tikz_code(tikz)
    if not ok:
        return {"ok": False, "error": err, "log": ""}

    engine = engine if engine in {"xelatex", "lualatex"} else "xelatex"
    key = cache_key(tikz, engine)
    cached_svg = CACHE_DIR / f"{key}.svg"

    if cached_svg.exists():
        return {
            "ok": True,
            "format": "svg",
            "svg": cached_svg.read_text(encoding="utf-8", errors="ignore"),
            "cached": True,
            "log": "",
        }

    with tempfile.TemporaryDirectory(prefix="lhl_tikz_") as tmp:
        tmp_path = Path(tmp)
        tex_path = tmp_path / "main.tex"
        pdf_path = tmp_path / "main.pdf"
        svg_path = tmp_path / "output.svg"

        tex_path.write_text(wrap_standalone_tex(tikz), encoding="utf-8")

        try:
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

            p2 = subprocess.run(
                ["dvisvgm", "--pdf", "main.pdf", "-n", "--exact", "-o", "output.svg"],
                cwd=tmp_path,
                capture_output=True,
                text=True,
                timeout=timeout_seconds,
            )

            if p2.returncode != 0 or not svg_path.exists():
                return {
                    "ok": False,
                    "error": "Chuyển PDF sang SVG thất bại.",
                    "log": short_log((p2.stdout or "") + "\n" + (p2.stderr or "")),
                }

            svg = svg_path.read_text(encoding="utf-8", errors="ignore")
            cached_svg.write_text(svg, encoding="utf-8")

            return {"ok": True, "format": "svg", "svg": svg, "cached": False, "log": ""}

        except subprocess.TimeoutExpired:
            return {"ok": False, "error": f"TikZ render quá thời gian cho phép ({timeout_seconds}s).", "log": "Timeout"}
        except FileNotFoundError as e:
            return {"ok": False, "error": "Server chưa cài đủ LaTeX/dvisvgm.", "log": str(e)}
        except Exception as e:
            return {"ok": False, "error": "Lỗi không xác định khi render TikZ.", "log": repr(e)}
