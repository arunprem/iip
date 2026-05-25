#!/usr/bin/env python3
"""Generate Android/iOS launcher icons from Kerala Police logo assets."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
LOGO = ROOT / "assets/images/kerala_police_logo_opaque.png"
ANDROID_RES = ROOT / "android/app/src/main/res"
IOS_ICONSET = ROOT / "ios/Runner/Assets.xcassets/AppIcon.appiconset"

# IIP primary blue — used if logo has transparency at edges
BACKGROUND = (255, 255, 255, 255)


def load_logo() -> Image.Image:
    img = Image.open(LOGO).convert("RGBA")
    return img


def fit_on_square(logo: Image.Image, size: int, padding_ratio: float = 0.12) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), BACKGROUND)
    inner = int(size * (1 - 2 * padding_ratio))
    w, h = logo.size
    scale = min(inner / w, inner / h)
    nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
    resized = logo.resize((nw, nh), Image.Resampling.LANCZOS)
    x = (size - nw) // 2
    y = (size - nh) // 2
    canvas.paste(resized, (x, y), resized)
    return canvas


def fit_foreground(logo: Image.Image, size: int, padding_ratio: float = 0.18) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    inner = int(size * (1 - 2 * padding_ratio))
    w, h = logo.size
    scale = min(inner / w, inner / h)
    nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
    resized = logo.resize((nw, nh), Image.Resampling.LANCZOS)
    x = (size - nw) // 2
    y = (size - nh) // 2
    canvas.paste(resized, (x, y), resized)
    return canvas


def save_png(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if img.mode == "RGBA":
        img.save(path, "PNG", optimize=True)
    else:
        img.convert("RGB").save(path, "PNG", optimize=True)


def android_icons(logo: Image.Image, fg: Image.Image) -> None:
    densities = {
        "mipmap-mdpi": 48,
        "mipmap-hdpi": 72,
        "mipmap-xhdpi": 96,
        "mipmap-xxhdpi": 144,
        "mipmap-xxxhdpi": 192,
    }
    for folder, px in densities.items():
        base = ANDROID_RES / folder
        save_png(fit_on_square(logo, px), base / "ic_launcher.png")
        save_png(fit_foreground(logo, px), base / "ic_launcher_foreground.png")

    anydpi = ANDROID_RES / "mipmap-anydpi-v26"
    anydpi.mkdir(parents=True, exist_ok=True)
    (anydpi / "ic_launcher.xml").write_text(
        """<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
""",
        encoding="utf-8",
    )

    values = ANDROID_RES / "values"
    values.mkdir(parents=True, exist_ok=True)
    colors_path = values / "colors.xml"
    colors_path.write_text(
        """<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#FFFFFF</color>
</resources>
""",
        encoding="utf-8",
    )


def ios_icons(logo: Image.Image) -> None:
    # filename -> pixel size
    icons = {
        "Icon-App-20x20@1x.png": 20,
        "Icon-App-20x20@2x.png": 40,
        "Icon-App-20x20@3x.png": 60,
        "Icon-App-29x29@1x.png": 29,
        "Icon-App-29x29@2x.png": 58,
        "Icon-App-29x29@3x.png": 87,
        "Icon-App-40x40@1x.png": 40,
        "Icon-App-40x40@2x.png": 80,
        "Icon-App-40x40@3x.png": 120,
        "Icon-App-60x60@2x.png": 120,
        "Icon-App-60x60@3x.png": 180,
        "Icon-App-76x76@1x.png": 76,
        "Icon-App-76x76@2x.png": 152,
        "Icon-App-83.5x83.5@2x.png": 167,
        "Icon-App-1024x1024@1x.png": 1024,
    }
    for name, px in icons.items():
        save_png(fit_on_square(logo, px), IOS_ICONSET / name)

    contents = {
        "images": [
            {"size": "20x20", "idiom": "iphone", "filename": "Icon-App-20x20@2x.png", "scale": "2x"},
            {"size": "20x20", "idiom": "iphone", "filename": "Icon-App-20x20@3x.png", "scale": "3x"},
            {"size": "29x29", "idiom": "iphone", "filename": "Icon-App-29x29@1x.png", "scale": "1x"},
            {"size": "29x29", "idiom": "iphone", "filename": "Icon-App-29x29@2x.png", "scale": "2x"},
            {"size": "29x29", "idiom": "iphone", "filename": "Icon-App-29x29@3x.png", "scale": "3x"},
            {"size": "40x40", "idiom": "iphone", "filename": "Icon-App-40x40@2x.png", "scale": "2x"},
            {"size": "40x40", "idiom": "iphone", "filename": "Icon-App-40x40@3x.png", "scale": "3x"},
            {"size": "60x60", "idiom": "iphone", "filename": "Icon-App-60x60@2x.png", "scale": "2x"},
            {"size": "60x60", "idiom": "iphone", "filename": "Icon-App-60x60@3x.png", "scale": "3x"},
            {"size": "20x20", "idiom": "ipad", "filename": "Icon-App-20x20@1x.png", "scale": "1x"},
            {"size": "20x20", "idiom": "ipad", "filename": "Icon-App-20x20@2x.png", "scale": "2x"},
            {"size": "29x29", "idiom": "ipad", "filename": "Icon-App-29x29@1x.png", "scale": "1x"},
            {"size": "29x29", "idiom": "ipad", "filename": "Icon-App-29x29@2x.png", "scale": "2x"},
            {"size": "40x40", "idiom": "ipad", "filename": "Icon-App-40x40@1x.png", "scale": "1x"},
            {"size": "40x40", "idiom": "ipad", "filename": "Icon-App-40x40@2x.png", "scale": "2x"},
            {"size": "76x76", "idiom": "ipad", "filename": "Icon-App-76x76@1x.png", "scale": "1x"},
            {"size": "76x76", "idiom": "ipad", "filename": "Icon-App-76x76@2x.png", "scale": "2x"},
            {
                "size": "83.5x83.5",
                "idiom": "ipad",
                "filename": "Icon-App-83.5x83.5@2x.png",
                "scale": "2x",
            },
            {
                "size": "1024x1024",
                "idiom": "ios-marketing",
                "filename": "Icon-App-1024x1024@1x.png",
                "scale": "1x",
            },
        ],
        "info": {"version": 1, "author": "xcode"},
    }
    (IOS_ICONSET / "Contents.json").write_text(
        json.dumps(contents, indent=2) + "\n", encoding="utf-8"
    )


def main() -> None:
    if not LOGO.is_file():
        raise SystemExit(f"Logo not found: {LOGO}")
    logo = load_logo()
    master = fit_on_square(logo, 1024)
    assets_dir = ROOT / "assets/images"
    save_png(master, assets_dir / "launcher_icon.png")
    android_icons(logo, master)
    ios_icons(logo)
    print("Launcher icons generated for Android and iOS.")


if __name__ == "__main__":
    main()
