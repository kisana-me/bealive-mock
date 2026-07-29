#!/usr/bin/env python3
"""bealive の seed 画像から、本番と同じ bealive_capture バリアントを書き出す。

本番 (app/models/concerns/image_processable.rb) の bealive_capture は
ImageMagick の `-resize 1500x2000^ -gravity center -extent 1500x2000`
+ `-quality 80` + webp 変換に相当する。ここでは同じ結果を Pillow で作る。

使い方:
    python3 tools/prepare-images.py ../bealive/src/db/seed_images
"""

import sys
from pathlib import Path

from PIL import Image

TARGET_WIDTH = 1500
TARGET_HEIGHT = 2000
QUALITY = 80
COUNT = 30

# seed のサフィックス -> 本番の写真カラム
VARIANTS = {"f": "main", "b": "sub"}


def to_capture_variant(source: Path, destination: Path) -> None:
    with Image.open(source) as image:
        image = image.convert("RGB")

        # `-resize 1500x2000^`: 縦横どちらも目標値以上になるまで拡縮する
        scale = max(TARGET_WIDTH / image.width, TARGET_HEIGHT / image.height)
        resized = image.resize(
            (round(image.width * scale), round(image.height * scale)),
            Image.LANCZOS,
        )

        # `-gravity center -extent 1500x2000`: 中央を切り取る
        left = (resized.width - TARGET_WIDTH) // 2
        top = (resized.height - TARGET_HEIGHT) // 2
        cropped = resized.crop((left, top, left + TARGET_WIDTH, top + TARGET_HEIGHT))

        destination.parent.mkdir(parents=True, exist_ok=True)
        cropped.save(destination, "WEBP", quality=QUALITY, method=6)


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 1

    seed_images = Path(sys.argv[1])
    output = Path(__file__).resolve().parent.parent / "public" / "images" / "variants"

    for number in range(1, COUNT + 1):
        for suffix, photo in VARIANTS.items():
            source = seed_images / f"{number}-{suffix}.webp"
            if not source.exists():
                print(f"missing: {source}")
                return 1
            to_capture_variant(source, output / f"capture-{number}-{photo}.webp")

    print(f"wrote {COUNT * len(VARIANTS)} variants to {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
