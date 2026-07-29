#!/usr/bin/env python3
"""bealive のアセットから、このモックが配信する画像を書き出す。

1. db/seed_images -> public/images/variants/capture-*.webp
   本番 (app/models/concerns/image_processable.rb) の bealive_capture バリアント。
   ImageMagick の `-resize 1500x2000^ -gravity center -extent 1500x2000`
   + `-quality 80` + webp 変換に相当する処理を Pillow で再現している。

2. public/static_assets/images/bealive-1.png
   -> public/static_assets/images/bealive-1-og.jpg
   og:image 用。元画像は 3840x2160 の 3.3MB なので、OG カードに十分な
   1200x675 の JPEG (約 15KB) に縮小する。

使い方:
    python3 tools/prepare-images.py ../bealive/src
"""

import sys
from pathlib import Path

from PIL import Image

CAPTURE_WIDTH = 1500
CAPTURE_HEIGHT = 2000
CAPTURE_QUALITY = 80
CAPTURE_COUNT = 30

# seed のサフィックス -> 本番の写真カラム
CAPTURE_VARIANTS = {"f": "main", "b": "sub"}

OG_WIDTH = 1200
OG_HEIGHT = 675
OG_QUALITY = 92

PUBLIC = Path(__file__).resolve().parent.parent / "public"


def to_capture_variant(source: Path, destination: Path) -> None:
    with Image.open(source) as image:
        image = image.convert("RGB")

        # `-resize 1500x2000^`: 縦横どちらも目標値以上になるまで拡縮する
        scale = max(CAPTURE_WIDTH / image.width, CAPTURE_HEIGHT / image.height)
        resized = image.resize(
            (round(image.width * scale), round(image.height * scale)),
            Image.LANCZOS,
        )

        # `-gravity center -extent 1500x2000`: 中央を切り取る
        left = (resized.width - CAPTURE_WIDTH) // 2
        top = (resized.height - CAPTURE_HEIGHT) // 2
        cropped = resized.crop(
            (left, top, left + CAPTURE_WIDTH, top + CAPTURE_HEIGHT)
        )

        destination.parent.mkdir(parents=True, exist_ok=True)
        cropped.save(destination, "WEBP", quality=CAPTURE_QUALITY, method=6)


def to_og_image(source: Path, destination: Path) -> None:
    with Image.open(source) as image:
        # 元画像も 16:9 なので切り取らずに縮小できる
        resized = image.convert("RGB").resize((OG_WIDTH, OG_HEIGHT), Image.LANCZOS)
        destination.parent.mkdir(parents=True, exist_ok=True)
        resized.save(
            destination, "JPEG", quality=OG_QUALITY, optimize=True, progressive=True
        )


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 1

    src = Path(sys.argv[1])
    seed_images = src / "db" / "seed_images"

    variants = PUBLIC / "images" / "variants"
    for number in range(1, CAPTURE_COUNT + 1):
        for suffix, photo in CAPTURE_VARIANTS.items():
            source = seed_images / f"{number}-{suffix}.webp"
            if not source.exists():
                print(f"missing: {source}")
                return 1
            to_capture_variant(source, variants / f"capture-{number}-{photo}.webp")
    print(f"wrote {CAPTURE_COUNT * len(CAPTURE_VARIANTS)} variants to {variants}")

    og_source = src / "public" / "static_assets" / "images" / "bealive-1.png"
    if not og_source.exists():
        print(f"missing: {og_source}")
        return 1
    og_destination = PUBLIC / "static_assets" / "images" / "bealive-1-og.jpg"
    to_og_image(og_source, og_destination)
    size_kb = og_destination.stat().st_size / 1024
    print(f"wrote {og_destination} ({size_kb:.1f} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
