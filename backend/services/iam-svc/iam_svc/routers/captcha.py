from __future__ import annotations

import base64
import random
import string
import uuid
from io import BytesIO
from pathlib import Path

from captcha.image import ImageCaptcha
from fastapi import APIRouter, Depends
from PIL import Image, ImageDraw, ImageFont
from pydantic import BaseModel
from redis.asyncio import Redis

from iam_svc.cache import get_redis

router = APIRouter(tags=["Captcha"])

CAPTCHA_WIDTH = 240
CAPTCHA_HEIGHT = 56
CAPTCHA_FONT_TARGET = 70


class CaptchaResponse(BaseModel):
    captcha_id: str
    image_base64: str


def generate_random_string(length: int = 6) -> str:
    return "".join(random.choices(string.ascii_lowercase, k=length))


def _load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    try:
        import captcha as captcha_pkg

        font_path = Path(captcha_pkg.__file__).parent / "fonts" / "DroidSansMonoBold.ttf"
        return ImageFont.truetype(str(font_path), size)
    except OSError:
        return ImageFont.load_default()


def _char_rotated_size(
    char: str,
    font: ImageFont.FreeTypeFont | ImageFont.ImageFont,
    angle: int,
    layer_pad: int,
) -> tuple[int, int]:
    layer_size = layer_pad * 2
    layer = Image.new("RGBA", (layer_size, layer_size), (0, 0, 0, 0))
    ImageDraw.Draw(layer).text((layer_pad, layer_pad), char, font=font, anchor="mm")
    rotated = layer.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
    bbox = rotated.getbbox()
    if not bbox:
        return 0, 0
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def _resolve_font_size(text: str) -> int:
    """Pick the largest font (up to CAPTCHA_FONT_TARGET) that fits the fixed canvas."""
    slot_width = CAPTCHA_WIDTH / (len(text) + 1)
    max_angle = 8

    for size in range(CAPTCHA_FONT_TARGET, 24, -2):
        font = _load_font(size)
        layer_pad = size // 2 + 8
        fits = True
        for char in text:
            rot_w, rot_h = _char_rotated_size(char, font, max_angle, layer_pad)
            if rot_h > CAPTCHA_HEIGHT - 2 or rot_w > slot_width:
                fits = False
                break
        if fits:
            return size

    return 28


def render_elegant_captcha(text: str) -> bytes:
    """Render captcha at fixed 240x56 with the largest readable font that fits."""
    image = Image.new("RGB", (CAPTCHA_WIDTH, CAPTCHA_HEIGHT), "#f8fafc")
    draw = ImageDraw.Draw(image)

    draw.rectangle(
        [0, 0, CAPTCHA_WIDTH - 1, CAPTCHA_HEIGHT - 1],
        outline="#e2e8f0",
        width=1,
    )

    font_size = _resolve_font_size(text)
    font = _load_font(font_size)
    reds = ("#b91c1c", "#dc2626", "#ef4444", "#991b1b")
    slot_width = CAPTCHA_WIDTH / (len(text) + 1)
    layer_size = font_size + 16

    for index, char in enumerate(text):
        char_layer = Image.new("RGBA", (layer_size, layer_size), (0, 0, 0, 0))
        char_draw = ImageDraw.Draw(char_layer)
        char_draw.text(
            (layer_size // 2, layer_size // 2),
            char,
            font=font,
            fill=random.choice(reds),
            anchor="mm",
        )
        angle = random.randint(-8, 8)
        char_layer = char_layer.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)

        center_x = int(slot_width * (index + 1))
        paste_x = center_x - char_layer.width // 2
        paste_y = (CAPTCHA_HEIGHT - char_layer.height) // 2
        image.paste(char_layer, (paste_x, paste_y), char_layer)

    buffer = BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


@router.get("/", response_model=CaptchaResponse)
async def generate_captcha(redis: Redis = Depends(get_redis)):
    captcha_text = generate_random_string()

    try:
        png_bytes = render_elegant_captcha(captcha_text)
    except Exception:
        fallback = ImageCaptcha(
            width=CAPTCHA_WIDTH,
            height=CAPTCHA_HEIGHT,
            font_sizes=(40, 46, 52),
        )
        png_bytes = fallback.generate(captcha_text).getvalue()

    base64_img = base64.b64encode(png_bytes).decode("utf-8")
    data_uri = f"data:image/png;base64,{base64_img}"

    captcha_id = str(uuid.uuid4())
    cache_key = f"captcha:{captcha_id}"

    await redis.setex(cache_key, 180, captcha_text)

    return CaptchaResponse(
        captcha_id=captcha_id,
        image_base64=data_uri,
    )
