#!/usr/bin/env python3
"""Bake a stable high-density visual material atlas from repository artwork.

The playable collision map is NEVER read from a picture. This creates only
decorative materials. Panels are 128×128, laid out:

  floor | connected stone tops | right wall face
  left wall face | oak northern door | southern portcullis

For bespoke image-generated updates, replace the crop sources with approved
higher-resolution images while preserving this exact 3×2 atlas contract.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageEnhance
import argparse

ROOT = Path(__file__).resolve().parents[1]
SCENE = ROOT / "assets" / "scene"
PROPS = ROOT / "assets" / "props"
OUT = SCENE / "dungeon_illustrated_atlas.webp"


def fit_crop(source, bounds, size=128):
    w, h = source.size
    x0, y0, x1, y1 = bounds
    crop = source.crop((max(0, x0), max(0, y0), min(w, x1), min(h, y1)))
    return crop.resize((size, size), Image.Resampling.LANCZOS)


def main(output: Path):
    stone = Image.open(SCENE / "cellar_stone_atlas.jpg").convert("RGBA")
    scene = Image.open(SCENE / "cellar_scene_gate.png").convert("RGBA")
    gate = Image.open(PROPS / "dungeon_gate_art_v2.webp").convert("RGBA")
    out = Image.new("RGBA", (384, 256), (0, 0, 0, 0))
    sw, sh = stone.size
    fw, fh = scene.size

    # Pixel art sampled exclusively from masonry, never other passages.
    panels = [
        fit_crop(stone, (int(sw*.42), 4, int(sw*.79), int(sh*.34))),
        fit_crop(scene, (int(fw*.14), int(fh*.45), int(fw*.36), int(fh*.61))),
        fit_crop(stone, (int(sw*.65), int(sh*.62), int(sw*.94), int(sh*.97))),
        fit_crop(stone, (int(sw*.36), int(sh*.63), int(sw*.68), int(sh*.98))),
    ]
    for i, panel in enumerate(panels):
        out.alpha_composite(panel, ((i % 3)*128, (i//3)*128))

    # Source asset contains both historical high-detail gate illustrations.
    # Keep stonework intact and cut black margins to alpha when appropriate.
    gw, gh = gate.size
    for i, bounds in enumerate([
        (0, 0, int(gw*.5), gh),
        (int(gw*.5), 0, gw, gh),
    ]):
        image = fit_crop(gate, bounds)
        px = (1 + i)*128
        out.alpha_composite(image, (px,128))
    output.parent.mkdir(parents=True,exist_ok=True)
    out.save(output, "WEBP", quality=90, method=6)
    print(f"Baked {output} ({out.width}×{out.height}, {output.stat().st_size:,} bytes)")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--output", type=Path, default=OUT)
    args = p.parse_args()
    main(args.output)
