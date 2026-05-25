"""IIP theme tokens for mobile clients (matches web portal CSS variables)."""

from __future__ import annotations

from typing import Any


def _rgb_hex(r: int, g: int, b: int) -> str:
    return f"#{r:02x}{g:02x}{b:02x}"


LIGHT_THEME: dict[str, Any] = {
    "mode": "light",
    "colors": {
        "bg": _rgb_hex(248, 250, 252),
        "surface": _rgb_hex(255, 255, 255),
        "surfaceHover": _rgb_hex(241, 245, 249),
        "surfaceActive": _rgb_hex(226, 232, 240),
        "primary": _rgb_hex(70, 95, 255),
        "primaryHover": _rgb_hex(55, 79, 224),
        "text": _rgb_hex(15, 23, 42),
        "textMuted": _rgb_hex(100, 116, 139),
        "border": _rgb_hex(226, 232, 240),
        "borderHover": _rgb_hex(203, 213, 225),
        "error": _rgb_hex(220, 38, 38),
        "success": _rgb_hex(16, 185, 129),
        "warning": _rgb_hex(217, 119, 6),
    },
}

DARK_THEME: dict[str, Any] = {
    "mode": "dark",
    "colors": {
        "bg": _rgb_hex(9, 9, 11),
        "surface": _rgb_hex(24, 24, 27),
        "surfaceHover": _rgb_hex(39, 39, 42),
        "surfaceActive": _rgb_hex(63, 63, 70),
        "primary": _rgb_hex(56, 189, 248),
        "primaryHover": _rgb_hex(2, 132, 199),
        "text": _rgb_hex(244, 244, 245),
        "textMuted": _rgb_hex(161, 161, 170),
        "border": _rgb_hex(39, 39, 42),
        "borderHover": _rgb_hex(63, 63, 70),
        "error": _rgb_hex(248, 113, 113),
        "success": _rgb_hex(52, 211, 153),
        "warning": _rgb_hex(251, 191, 36),
    },
}


def mobile_theme_bundle() -> dict[str, Any]:
    return {"default_mode": "dark", "light": LIGHT_THEME, "dark": DARK_THEME}
