"""Faction banner textures (original pixel art, same emblems as the ledger UI banners).
Each banner is two blocks: top (rod, field, emblem) and bottom (field, emblem, forked tail). 16 x 16 each.
Edit the maps and re-run: python3 assets-src/blocks/make_banners.py"""
import os
from PIL import Image

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packs", "RP", "textures", "bannerforge", "settlements", "blocks")

# r = rod, f = field, d = field shade (border), e = emblem, s = emblem shade, . = transparent
TOP = {
    "blue": [  # Kingscross Guild: gold cross
        "rrrrrrrrrrrrrrrr", "rrrrrrrrrrrrrrrr", ".dddddddddddddd.", ".dffffffffffffd.", ".dffffffffffffd.", ".dfffffeefffffd.",
        ".dfffffeefffffd.", ".dfffffeefffffd.", ".dfeeeeeeeeeefd.", ".dfsssseessssfd.", ".dfffffeefffffd.", ".dfffffeefffffd.",
        ".dfffffeefffffd.", ".dfffffeefffffd.", ".dfffffeefffffd.", ".dfffffeefffffd."],
    "green": [  # Amberwood Order: tree
        "rrrrrrrrrrrrrrrr", "rrrrrrrrrrrrrrrr", ".dddddddddddddd.", ".dffffffffffffd.", ".dfffffeefffffd.", ".dffffeeeeffffd.",
        ".dfffeeeeeefffd.", ".dffeeeeeeeeffd.", ".dffeeesseeeffd.", ".dfffeeeeeefffd.", ".dffffeeeeffffd.", ".dfffffsSfffffd.",
        ".dfffffsSfffffd.", ".dfffffsSfffffd.", ".dffffssSSffffd.", ".dffffffffffffd."],
    "red": [  # Brimstone Legion: gold hammer
        "rrrrrrrrrrrrrrrr", "rrrrrrrrrrrrrrrr", ".dddddddddddddd.", ".dffffffffffffd.", ".dffffffffffffd.", ".dffeeeeeeeeffd.",
        ".dffeeeeeeeeffd.", ".dffssssssssffd.", ".dfffffSSfffffd.", ".dfffffSSfffffd.", ".dfffffSSfffffd.", ".dfffffSSfffffd.",
        ".dfffffSSfffffd.", ".dfffffSSfffffd.", ".dfffffSSfffffd.", ".dffffffffffffd."],
}
BOTTOM = {
    "blue": [".dfffffeefffffd."] * 5 + [".dffffffffffffd."] * 5 + [".dffffffffffffd.", ".ddffffffffffdd.", "..dffffffffffd..", "..dfffd..dfffd..", "...dfd....dfd...", "....d......d...."],
    "green": [".dffffffffffffd."] * 6 + [".dffeffffffeffd.", ".dfffeffffefffd.", ".dffffeffeffffd.", ".dffffffffffffd."] + [".dffffffffffffd.", ".ddffffffffffdd.", "..dffffffffffd..", "..dfffd..dfffd..", "...dfd....dfd...", "....d......d...."],
    "red": [".dfffffSSfffffd.", ".dffffsSSsffffd.", ".dffffffffffffd."] + [".dffffffffffffd."] * 7 + [".dffffffffffffd.", ".ddffffffffffdd.", "..dffffffffffd..", "..dfffd..dfffd..", "...dfd....dfd...", "....d......d...."],
}
COLORS = {
    "blue": {"f": (45, 90, 168), "d": (30, 60, 120), "e": (227, 195, 90), "s": (190, 150, 60), "S": (190, 150, 60)},
    "green": {"f": (47, 122, 58), "d": (30, 85, 40), "e": (126, 240, 154), "s": (80, 180, 100), "S": (110, 80, 48)},
    "red": {"f": (143, 42, 32), "d": (100, 28, 22), "e": (227, 195, 90), "s": (190, 150, 60), "S": (120, 120, 125)},
}
ROD = (66, 43, 21)

for faction in ("blue", "green", "red"):
    for part, maps in (("top", TOP), ("bottom", BOTTOM)):
        rows = maps[faction]
        assert len(rows) == 16 and all(len(r) == 16 for r in rows), (faction, part)
        img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
        for y, row in enumerate(rows):
            for x, c in enumerate(row):
                if c == ".":
                    continue
                rgb = ROD if c == "r" else COLORS[faction][c]
                img.putpixel((x, y), rgb + (255,))
        img.save(os.path.join(OUT, f"banner_{faction}_{part}.png"))
print("ok")
