"""Gallery of generated candidates for owner review (docs/STRUCTURES.md).
Usage: python3 assets-src/structures/gallery.py <count> [first_seed] [level]
Writes assets-src/structures/previews/gallery_<faction>_<building>.png and a .txt with each seed's description
and QA result. Candidates that fail QA are shown with a red number."""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from PIL import Image, ImageDraw  # noqa: E402

import qa  # noqa: E402
from kingscross import house_gen  # noqa: E402
from kingscross.palette import ALLOWED  # noqa: E402
from preview import font, iso  # noqa: E402

NEEDS = {1: {"bed": 2}, 2: {"bed": 3}, 3: {"bed": 4}}


def main():
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 24
    first = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    show_level = int(sys.argv[3]) if len(sys.argv) > 3 else 3
    seeds = list(range(first, first + count))
    tiles, lines = [], []
    for seed in seeds:
        levels = [house_gen.house(seed, lv) for lv in (1, 2, 3)]
        errs = []
        for bp in levels:
            e, _ = qa.check(bp, 13, house_gen.H, ALLOWED | {house_gen.BANNER}, NEEDS[bp.level])
            errs += e
        tiles.append((seed, iso(levels[show_level - 1], 0, tile=16), not errs))
        lines.append(f"{seed:3d}  {'OK ' if not errs else 'QA!'}  {levels[2].notes[0].split(': ', 1)[1]} | {levels[2].notes[1]}")
        for e in errs:
            lines.append(f"       {e}")
    cols = 6
    cw = max(t.width for _, t, _ in tiles) + 16
    ch = max(t.height for _, t, _ in tiles) + 34
    rows = (len(tiles) + cols - 1) // cols
    img = Image.new("RGB", (cols * cw + 20, rows * ch + 60), (120, 165, 210))
    d = ImageDraw.Draw(img)
    d.text((14, 12), f"Kingscross houses - generated candidates, level {show_level} (number = seed)", fill=(20, 30, 60), font=font(24))
    for i, (seed, t, ok) in enumerate(tiles):
        cx, cy = 10 + (i % cols) * cw, 50 + (i // cols) * ch
        d.rectangle([cx + 2, cy + 2, cx + cw - 4, cy + ch - 4], fill=(132, 175, 218))
        img.paste(t, (cx + (cw - t.width) // 2, cy + ch - t.height - 8), t)
        d.text((cx + 8, cy + 6), str(seed), fill=(20, 30, 60) if ok else (200, 20, 20), font=font(22))
    out = os.path.join(HERE, "previews", "gallery_blue_house.png")
    img.save(out)
    with open(out.replace(".png", ".txt"), "w") as f:
        f.write("\n".join(lines) + "\n")
    print("\n".join(lines))
    print(out)


if __name__ == "__main__":
    main()
