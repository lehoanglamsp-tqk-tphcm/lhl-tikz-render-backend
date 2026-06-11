from __future__ import annotations

from typing import Tuple

BLOCKED_COMMANDS = [
    r"\write18",
    r"\input",
    r"\include",
    r"\openout",
    r"\read",
    r"\catcode",
    r"\usepackage",
    r"\documentclass",
    r"\newwrite",
    r"\immediate",
    r"\@@input",
]


def validate_tikz_code(code: str) -> Tuple[bool, str]:
    """Very small safety filter for TikZ-only input."""
    raw = code or ""
    lowered = raw.lower()

    for cmd in BLOCKED_COMMANDS:
        if cmd.lower() in lowered:
            return False, f"Lệnh không được phép trong TikZ online: {cmd}"

    if len(raw) > 120_000:
        return False, "Code TikZ quá dài. Vui lòng rút gọn hoặc tách hình."

    return True, ""
