from __future__ import annotations

import base64
import random
import string
import uuid
from functools import lru_cache
from io import BytesIO
from pathlib import Path

from captcha.image import ImageCaptcha
from fastapi import APIRouter, Depends
from PIL import Image, ImageDraw, ImageFont
from pydantic import BaseModel
from redis.asyncio import Redis

from iam_svc.cache import get_redis
from iam_svc.services.captcha_store import save_captcha

router = APIRouter(tags=["Captcha"])

CAPTCHA_WIDTH = 240
CAPTCHA_HEIGHT = 56
CAPTCHA_FONT_SIZE = 44
CAPTCHA_CHAR_COUNT = 6


class CaptchaResponse(BaseModel):
    captcha_id: str
    image_base64: str


def generate_random_string(length: int = CAPTCHA_CHAR_COUNT) -> str:
    return "".join(random.choices(string.ascii_lowercase, k=length))


@lru_cache(maxsize=1)
def _captcha_font_path() -> Path:
    """Resolve the bundled DroidSansMono font shipped with the captcha package."""
    import captcha as captcha_pkg

    package_root = Path(captcha_pkg.__file__).resolve().parent
    candidates = (
        package_root / "data" / "DroidSansMono.ttf",
        package_root / "fonts" / "DroidSansMonoBold.ttf",
        package_root / "fonts" / "DroidSansMono.ttf",
    )
    for path in candidates:
        if path.is_file():
            return path
    raise FileNotFoundError(
        "Captcha font not found. Expected DroidSansMono.ttf under the captcha package."
    )


def _load_font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(_captcha_font_path()), size)


def _text_bbox(
    draw: ImageDraw.ImageDraw,
    text: str,
    font: ImageFont.FreeTypeFont,
) -> tuple[int, int, int, int]:
    if hasattr(draw, "textbbox"):
        return draw.textbbox((0, 0), text, font=font)
    width, height = draw.textsize(text, font=font)  # type: ignore[attr-defined]
    return (0, 0, width, height)


def _draw_noise(draw: ImageDraw.ImageDraw) -> None:
    for _ in range(4):
        x1 = random.randint(0, CAPTCHA_WIDTH - 1)
        y1 = random.randint(0, CAPTCHA_HEIGHT - 1)
        x2 = random.randint(0, CAPTCHA_WIDTH - 1)
        y2 = random.randint(0, CAPTCHA_HEIGHT - 1)
        draw.line((x1, y1, x2, y2), fill="#cbd5e1", width=1)


def render_elegant_captcha(text: str) -> bytes:
    """Render captcha at fixed 240×56 — large centered text, high contrast."""
    image = Image.new("RGB", (CAPTCHA_WIDTH, CAPTCHA_HEIGHT), "#ffffff")
    draw = ImageDraw.Draw(image)
    _draw_noise(draw)

    font = _load_font(CAPTCHA_FONT_SIZE)
    fill = random.choice(("#7f1d1d", "#991b1b", "#b91c1c", "#dc2626"))

    left, top, right, bottom = _text_bbox(draw, text, font)
    text_w = right - left
    text_h = bottom - top
    x = (CAPTCHA_WIDTH - text_w) // 2 - left
    y = (CAPTCHA_HEIGHT - text_h) // 2 - top
    draw.text((x, y), text, font=font, fill=fill)

    buffer = BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


async def _generate_captcha_response(redis: Redis | None) -> CaptchaResponse:
    captcha_text = generate_random_string()

    try:
        png_bytes = render_elegant_captcha(captcha_text)
    except Exception:
        fallback = ImageCaptcha(
            width=CAPTCHA_WIDTH,
            height=CAPTCHA_HEIGHT,
            fonts=[str(_captcha_font_path())],
            font_sizes=(CAPTCHA_FONT_SIZE,),
        )
        png_bytes = fallback.generate(captcha_text).getvalue()

    base64_img = base64.b64encode(png_bytes).decode("utf-8")
    data_uri = f"data:image/png;base64,{base64_img}"

    captcha_id = str(uuid.uuid4())
    await save_captcha(redis, captcha_id, captcha_text)

    return CaptchaResponse(
        captcha_id=captcha_id,
        image_base64=data_uri,
    )


@router.get("", response_model=CaptchaResponse)
@router.get("/", response_model=CaptchaResponse, include_in_schema=False)
async def generate_captcha(redis: Redis = Depends(get_redis)) -> CaptchaResponse:
    return await _generate_captcha_response(redis)
