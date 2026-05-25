#!/usr/bin/env python3
"""Generate native splash assets for Android and iOS."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
LOGO = ROOT / "assets/images/kerala_police_logo_opaque.png"
ANDROID_RES = ROOT / "android/app/src/main/res"
IOS_LAUNCH = ROOT / "ios/Runner/Assets.xcassets/LaunchImage.imageset"
ASSETS = ROOT / "assets/images"

BACKGROUND_LIGHT = (248, 250, 252, 255)  # #F8FAFC
BACKGROUND_DARK = (9, 9, 11, 255)  # #09090B

# Solid background only — logo is drawn by Flutter splash (no double native logo flash).
LAUNCH_BACKGROUND_XML = """<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item>
        <color android:color="@color/splash_background"/>
    </item>
</layer-list>
"""


def load_logo() -> Image.Image:
    return Image.open(LOGO).convert("RGBA")


def brand_mark(logo: Image.Image, size: int) -> Image.Image:
    """White circle + colored emblem (for Flutter asset and optional marketing)."""
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    circle_d = int(size * 0.72)
    x0 = (size - circle_d) // 2
    y0 = (size - circle_d) // 2
    draw = ImageDraw.Draw(canvas)
    draw.ellipse((x0, y0, x0 + circle_d, y0 + circle_d), fill=(255, 255, 255, 255))

    inner = int(circle_d * 0.62)
    w, h = logo.size
    scale = min(inner / w, inner / h)
    nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
    resized = logo.resize((nw, nh), Image.Resampling.LANCZOS)
    lx = (size - nw) // 2
    ly = (size - nh) // 2
    canvas.paste(resized, (lx, ly), resized)
    return canvas


def full_splash(logo: Image.Image, size: int, bg: tuple[int, int, int, int]) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), bg)
    mark = brand_mark(logo, size)
    canvas.alpha_composite(mark)
    return canvas


def save_png(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG", optimize=True)


def android_splash() -> None:
    for folder in ("drawable", "drawable-v21"):
        target = ANDROID_RES / folder
        target.mkdir(parents=True, exist_ok=True)
        (target / "launch_background.xml").write_text(LAUNCH_BACKGROUND_XML, encoding="utf-8")

    colors_path = ANDROID_RES / "values/colors.xml"
    text = colors_path.read_text(encoding="utf-8")
    if "splash_background" not in text:
        text = text.replace(
            "</resources>",
            '    <color name="splash_background">#F8FAFC</color>\n</resources>',
        )
        colors_path.write_text(text, encoding="utf-8")

    values_night = ANDROID_RES / "values-night"
    values_night.mkdir(parents=True, exist_ok=True)
    (values_night / "colors.xml").write_text(
        """<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="splash_background">#09090B</color>
</resources>
""",
        encoding="utf-8",
    )

    for folder in ("values", "values-night"):
        styles = ANDROID_RES / folder / "styles.xml"
        if not styles.is_file():
            continue
        content = styles.read_text(encoding="utf-8")
        content = content.replace(
            "<item name=\"android:windowBackground\">?android:colorBackground</item>",
            "<item name=\"android:windowBackground\">@color/splash_background</item>",
        )
        styles.write_text(content, encoding="utf-8")

    # Remove old bitmap splash if present (caused blue-logo-on-black flash).
    old = ANDROID_RES / "drawable-nodpi/splash_logo.png"
    if old.is_file():
        old.unlink()


def ios_splash(logo: Image.Image) -> None:
    sizes = {
        "LaunchImage.png": 168,
        "LaunchImage@2x.png": 336,
        "LaunchImage@3x.png": 504,
    }
    IOS_LAUNCH.mkdir(parents=True, exist_ok=True)
    for name, px in sizes.items():
        save_png(full_splash(logo, px, BACKGROUND_LIGHT), IOS_LAUNCH / name)


def flutter_assets(logo: Image.Image) -> None:
    save_png(brand_mark(logo, 512), ASSETS / "splash_brand_mark.png")
    save_png(full_splash(logo, 1024, BACKGROUND_DARK), ASSETS / "splash_dark.png")
    save_png(full_splash(logo, 1024, BACKGROUND_LIGHT), ASSETS / "splash_light.png")


def main() -> None:
    if not LOGO.is_file():
        raise SystemExit(f"Logo not found: {LOGO}")
    logo = load_logo()
    android_splash()
    ios_splash(logo)
    flutter_assets(logo)
    print("Native splash: solid background only. Flutter assets: splash_brand_mark.png")


if __name__ == "__main__":
    main()
