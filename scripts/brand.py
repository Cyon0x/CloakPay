#!/usr/bin/env python3
"""
Derives the shipped brand assets from the master artwork.

The master (`brand/source/cloakpay-logo-master.png`) is never modified. Every
other file is regenerated from it by this script, so what the product renders is
always a crop or a documented tonal variant of the supplied original. Nothing is
redrawn, re-typeset, or replaced with a lookalike.

Outputs
  public/brand/mark.png            cloak symbol, padded for optical weight
  public/brand/mark-light.png      same artwork, lightened for dark surfaces
  public/brand/wordmark.png        the supplied CLOAKPAY lettering
  public/brand/wordmark-light.png
  public/brand/lockup.png          mark + wordmark as one asset
  app/icon.png                     application icon on the brand paper ground
  app/apple-icon.png
  app/favicon.ico

  mobile/assets/icon.png          1024 square, paper ground, no transparency
  mobile/assets/adaptive-icon.png  1024 transparent foreground for Android
  mobile/assets/splash.png         paper ground with the mark centred
  mobile/assets/mark.png           copy of the padded symbol
  mobile/assets/wordmark.png       copy of the supplied lettering
  mobile/assets/favicon.png        48 square, paper ground

Requires Pillow:  python3 -m pip install pillow
Run:              python3 scripts/brand.py
"""

from pathlib import Path
import sys

try:
    from PIL import Image, ImageChops
except ImportError:  # pragma: no cover - tooling convenience, not app code
    sys.exit("Pillow is required: python3 -m pip install pillow")

ROOT = Path(__file__).resolve().parent.parent
MASTER = ROOT / "brand" / "source" / "cloakpay-logo-master.png"
PUBLIC = ROOT / "public" / "brand"
APP = ROOT / "app"
MOBILE_ASSETS = ROOT / "mobile" / "assets"

PAPER = (250, 249, 247, 255)
# The symbol occupies this share of its square, which keeps it legible at 20px
# without the artwork touching the box edges.
MARK_FILL = 0.84
# Tonal lift for dark surfaces. One value for both assets, because they sit in
# the same lockup and have to read as one mark. It is squeezed from both sides:
# the wordmark renders at text size so it needs genuine contrast, while the
# symbol's folds are the artwork and they flatten out as they approach white.
# 0.62 is where the lettering clears 7:1 on the near-black page and the folds
# still read apart.
LIGHTEN = 0.62
ALPHA_FLOOR = 8


def alpha_bounds(image, box):
    """Exact artwork bounds inside `box`, using the alpha channel only."""
    region = image.crop(box)
    return region.split()[3].point(lambda v: 255 if v > ALPHA_FLOOR else 0).getbbox()


def tightly_crop(image, box, pad=0):
    inner = image.crop(box)
    bounds = inner.split()[3].point(lambda v: 255 if v > ALPHA_FLOOR else 0).getbbox()
    if bounds is None:
        raise SystemExit(f"no opaque pixels inside {box}")
    left, top, right, bottom = bounds
    return inner.crop(
        (max(0, left - pad), max(0, top - pad), min(inner.width, right + pad), min(inner.height, bottom + pad))
    )


def lighten(image, amount=LIGHTEN):
    """
    Tonal variant for dark surfaces.

    Shading is preserved by lightening every pixel toward white by a fixed
    amount rather than flattening the artwork to a single silhouette, so the
    symbol keeps the depth it has in the master.
    """
    rgb = image.convert("RGB")
    white = Image.new("RGB", rgb.size, (255, 255, 255))
    lightened = Image.blend(rgb, white, amount)
    out = lightened.convert("RGBA")
    out.putalpha(image.split()[3])
    return out


def fit_square(image, side, fill=MARK_FILL):
    """Places the artwork in a transparent square at `fill` of its height."""
    target = int(side * fill)
    ratio = target / image.height
    scaled = image.resize((max(1, round(image.width * ratio)), target), Image.LANCZOS)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(scaled, ((side - scaled.width) // 2, (side - scaled.height) // 2), scaled)
    return canvas


def on_ground(image, side, fill, ground=PAPER, radius_ratio=0.22):
    """Icon treatment: the artwork on the brand paper ground."""
    base = Image.new("RGBA", (side, side), ground)
    mark = fit_square(image, side, fill)
    base.alpha_composite(mark)
    mask = Image.new("L", (side, side), 0)
    from PIL import ImageDraw

    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, side - 1, side - 1), radius=int(side * radius_ratio), fill=255
    )
    base.putalpha(mask)
    return base


def mark_on_ground(image, side, fill):
    """The symbol on the paper ground, square and fully opaque."""
    base = Image.new("RGB", (side, side), PAPER[:3])
    mark = fit_square(image, side, fill)
    base.paste(mark, (0, 0), mark)
    return base


def main():
    if not MASTER.exists():
        raise SystemExit(f"master artwork not found at {MASTER}")

    master = Image.open(MASTER).convert("RGBA")
    alpha = master.split()[3].point(lambda v: 255 if v > ALPHA_FLOOR else 0)
    bounds = alpha.getbbox()
    if bounds is None:
        raise SystemExit("master artwork has no opaque pixels")

    left, top, right, bottom = bounds
    # The master is a stacked lockup: symbol on top, wordmark below, separated by
    # a clear horizontal band of transparent rows.
    profile = [1 if alpha.getpixel((x, y)) else 0 for y in range(top, bottom) for x in range(left, right, 4)]
    rows = [
        any(alpha.getpixel((x, y)) for x in range(left, right, 2))
        for y in range(top, bottom + 1)
    ]
    gaps = []
    last = None
    for index, filled in enumerate(rows):
        if filled:
            if last is not None and index - last > 1:
                gaps.append((last + top, index + top))
            last = index
    if not gaps:
        raise SystemExit("could not separate the symbol from the wordmark; check the master")

    split = max(gaps, key=lambda g: g[1] - g[0])
    symbol_box = (left, top, right, split[0])
    word_box = (left, split[1], right, bottom + 1)

    symbol = tightly_crop(master, symbol_box)
    wordmark = tightly_crop(master, word_box)

    PUBLIC.mkdir(parents=True, exist_ok=True)
    APP.mkdir(parents=True, exist_ok=True)

    mark = fit_square(symbol, 512)
    mark.save(PUBLIC / "mark.png", optimize=True)
    mark_light = fit_square(lighten(symbol), 512)
    mark_light.save(PUBLIC / "mark-light.png", optimize=True)

    wordmark.save(PUBLIC / "wordmark.png", optimize=True)
    lighten(wordmark).save(PUBLIC / "wordmark-light.png", optimize=True)

    # Lockup: symbol at the wordmark's cap height, on one transparent strip.
    word_height = wordmark.height
    symbol_scaled = symbol.resize(
        (max(1, round(symbol.width * (word_height * 1.9) / symbol.height)), round(word_height * 1.9)),
        Image.LANCZOS,
    )
    gap = round(word_height * 0.85)
    lockup = Image.new(
        "RGBA", (symbol_scaled.width + gap + wordmark.width, symbol_scaled.height), (0, 0, 0, 0)
    )
    lockup.alpha_composite(symbol_scaled, (0, 0))
    lockup.alpha_composite(wordmark, (symbol_scaled.width + gap, (symbol_scaled.height - wordmark.height) // 2))
    lockup.save(PUBLIC / "lockup.png", optimize=True)

    on_ground(symbol, 512, 0.70).save(APP / "icon.png", optimize=True)
    on_ground(symbol, 180, 0.70).save(APP / "apple-icon.png", optimize=True)
    on_ground(symbol, 64, 0.72, radius_ratio=0.18).save(
        APP / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)]
    )

    # The mobile app takes the same artwork. Expo needs a 1024 opaque square,
    # a transparent adaptive foreground, and a splash tile, and they are all
    # generated here so the phone icon can never drift from the web icon.
    MOBILE_ASSETS.mkdir(parents=True, exist_ok=True)
    mark_on_ground(symbol, 1024, 0.66).save(MOBILE_ASSETS / "icon.png", optimize=True)
    fit_square(symbol, 1024, 0.60).save(MOBILE_ASSETS / "adaptive-icon.png", optimize=True)
    mark_on_ground(symbol, 1284, 0.32).save(MOBILE_ASSETS / "splash.png", optimize=True)
    mark_on_ground(symbol, 48, 0.72).save(MOBILE_ASSETS / "favicon.png", optimize=True)
    mark.save(MOBILE_ASSETS / "mark.png", optimize=True)
    wordmark.save(MOBILE_ASSETS / "wordmark.png", optimize=True)

    print(f"master bounds       {bounds}")
    print(f"symbol crop         {symbol.width}x{symbol.height}")
    print(f"wordmark crop       {wordmark.width}x{wordmark.height}")
    print("wrote 8 web assets and 6 mobile assets from the untouched master")


if __name__ == "__main__":
    main()
