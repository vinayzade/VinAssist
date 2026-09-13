"""
Generates the Android and iOS launcher icons from one square artwork.

    python scripts/generate_app_icons.py path/to/logo.png

Android
- Adaptive icon (API 26+): a foreground layer with the artwork scaled into
  the 66/108 safe zone and a background layer made from the artwork's own
  blurred, zoomed colours so every launcher mask (circle, squircle, square)
  shows matching edges.
- Legacy `ic_launcher` (the artwork on a rounded square) and
  `ic_launcher_round` (circular crop of the composite) for every density.

iOS
- One 1024 px icon without alpha, referenced from the asset catalog.

Requires Pillow (installed in the backend virtualenv).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "android" / "app" / "src" / "main" / "res"
IOS_ICONSET = ROOT / "ios" / "VinAssist" / "Images.xcassets" / "AppIcon.appiconset"

# dp sizes per density bucket: legacy icon is 48dp, adaptive layers are 108dp.
DENSITIES = {"mdpi": 1.0, "hdpi": 1.5, "xhdpi": 2.0, "xxhdpi": 3.0, "xxxhdpi": 4.0}
LEGACY_DP = 48
ADAPTIVE_DP = 108
# Larger than the nominal 66/108 safe zone: the artwork's own rounded corners
# may be masked, but the wordmark must stay inside a 72dp circle.
SAFE_ZONE = 0.76
# Fraction of the source image occupied by the rounded square (it sits on a
# black margin); measured on the supplied artwork.
ART_BOX = (0.058, 0.056, 0.939, 0.940)
CORNER_RADIUS = 0.22  # of the art size


def load_art(path: Path) -> Image.Image:
    """Crops the artwork to its rounded square and makes the corners transparent."""
    image = Image.open(path).convert("RGBA")
    w, h = image.size
    box = (int(w * ART_BOX[0]), int(h * ART_BOX[1]), int(w * ART_BOX[2]), int(h * ART_BOX[3]))
    art = image.crop(box)
    size = min(art.size)
    art = art.resize((size, size), Image.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=int(size * CORNER_RADIUS), fill=255)
    art.putalpha(mask)
    return art


def background_layer(art: Image.Image, size: int) -> Image.Image:
    """The artwork zoomed to cover and blurred: a seamless backdrop under any mask."""
    zoom = art.resize((int(size * 1.6), int(size * 1.6)), Image.LANCZOS).convert("RGB")
    offset = (zoom.size[0] - size) // 2
    cover = zoom.crop((offset, offset, offset + size, offset + size))
    return cover.filter(ImageFilter.GaussianBlur(size * 0.12)).convert("RGBA")


def foreground_layer(art: Image.Image, size: int) -> Image.Image:
    """Artwork centred in the safe zone on a transparent canvas."""
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    inner = int(size * SAFE_ZONE)
    scaled = art.resize((inner, inner), Image.LANCZOS)
    layer.alpha_composite(scaled, ((size - inner) // 2, (size - inner) // 2))
    return layer


def composite(art: Image.Image, size: int) -> Image.Image:
    """What an adaptive launcher shows before masking: background + foreground."""
    out = background_layer(art, size)
    out.alpha_composite(foreground_layer(art, size))
    return out


def circular(image: Image.Image) -> Image.Image:
    size = image.size[0]
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    out = image.copy()
    out.putalpha(mask)
    return out


def write_android(art: Image.Image) -> None:
    for bucket, scale in DENSITIES.items():
        folder = RES / f"mipmap-{bucket}"
        folder.mkdir(parents=True, exist_ok=True)
        legacy = int(LEGACY_DP * scale)
        adaptive = int(ADAPTIVE_DP * scale)
        art.resize((legacy, legacy), Image.LANCZOS).save(folder / "ic_launcher.png")
        circular(composite(art, legacy)).save(folder / "ic_launcher_round.png")
        foreground_layer(art, adaptive).save(folder / "ic_launcher_foreground.png")
        background_layer(art, adaptive).save(folder / "ic_launcher_background.png")

    anydpi = RES / "mipmap-anydpi-v26"
    anydpi.mkdir(parents=True, exist_ok=True)
    xml = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <background android:drawable="@mipmap/ic_launcher_background" />\n'
        '    <foreground android:drawable="@mipmap/ic_launcher_foreground" />\n'
        "</adaptive-icon>\n"
    )
    (anydpi / "ic_launcher.xml").write_text(xml, encoding="utf-8")
    (anydpi / "ic_launcher_round.xml").write_text(xml, encoding="utf-8")


def write_ios(art: Image.Image) -> None:
    IOS_ICONSET.mkdir(parents=True, exist_ok=True)
    # App Store icons must be opaque: flatten the rounded corners onto the backdrop.
    icon = composite(art, 1024)
    # iOS applies its own corner mask, so fill the whole canvas with the artwork.
    full = art.resize((1024, 1024), Image.LANCZOS)
    icon.alpha_composite(full)
    icon.convert("RGB").save(IOS_ICONSET / "AppIcon.png", optimize=True)
    contents = {
        "images": [{"filename": "AppIcon.png", "idiom": "universal", "platform": "ios", "size": "1024x1024"}],
        "info": {"author": "xcode", "version": 1},
    }
    (IOS_ICONSET / "Contents.json").write_text(json.dumps(contents, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: generate_app_icons.py <logo.png>")
    art = load_art(Path(sys.argv[1]))
    write_android(art)
    write_ios(art)
    print("Icons written for", ", ".join(f"mipmap-{b}" for b in DENSITIES), "and iOS AppIcon.appiconset")


if __name__ == "__main__":
    main()
