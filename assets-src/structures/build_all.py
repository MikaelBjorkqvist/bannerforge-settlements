"""Builds every blueprint: QA checks, preview sheets, and the generated TypeScript module for the game.
Usage: python3 assets-src/structures/build_all.py        (from the repo root)
Exit code 1 if any QA error. Add new buildings to BUILDINGS below.
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from bfstruct import export_ts, to_data  # noqa: E402
from preview import level_strip, sheet  # noqa: E402
import qa  # noqa: E402
from kingscross import house as ks_house  # noqa: E402
from kingscross.palette import ALLOWED as KS_ALLOWED  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(HERE))
OUT_TS = os.path.join(ROOT, "src", "scripts", "settlements", "generated", "blueprints.ts")
PREVIEWS = os.path.join(HERE, "previews")

# The plot width comes from the game's building catalogue, so a design can never silently miss its plot
# (play-test 2026-11-15: 9x9 houses on 13x13 house plots fell back to placeholder boxes).
PLOT_WIDTH = {"S": 9, "M": 13, "L": 17}
CATALOGUE = os.path.join(ROOT, "src", "scripts", "settlements", "buildings.ts")


def plot_width(building: str) -> int:
    src = open(CATALOGUE).read()
    m = re.search(r'id: "' + re.escape(building) + r'",[^}]*?plot: "(\w+)"', src)
    if not m or m.group(1) not in PLOT_WIDTH:
        raise SystemExit(f"ERROR building {building!r}: no S/M/L plot in {os.path.relpath(CATALOGUE, ROOT)}")
    return PLOT_WIDTH[m.group(1)]


# faction, building id, variant, generator, height limit, palette, required contents per level
HOUSE_NEEDS = {1: {"bed": 2}, 2: {"bed": 3}, 3: {"bed": 4}}
BUILDINGS = [
    ("blue", "house", "a", ks_house.blueprints_a, 16, KS_ALLOWED, HOUSE_NEEDS),
    ("blue", "house", "b", ks_house.blueprints_b, 16, KS_ALLOWED, HOUSE_NEEDS),
]


def main():
    os.makedirs(PREVIEWS, exist_ok=True)
    os.makedirs(os.path.dirname(OUT_TS), exist_ok=True)
    entries, variants, errors = {}, {}, []
    for faction, building, variant, gen, max_h, allowed, needs in BUILDINGS:
        plot_w = plot_width(building)
        bps = gen()
        for bp in bps:
            e, w = qa.check(bp, plot_w, max_h, allowed, needs.get(bp.level, {}))
            errors += e
            for msg in e:
                print("ERROR", msg)
            for msg in w:
                print("warn ", msg)
            entries[f"{faction}/{building}/{variant}/{bp.level}"] = to_data(bp)
            sheet(bp, f"{building.title()} {variant.upper()} - Level {bp.level} ({faction})", bp.notes, os.path.join(PREVIEWS, f"{faction}_{building}_{variant}_l{bp.level}.png"))
        level_strip(bps, f"{building.title()} {variant.upper()} - levels 1-3 ({faction})", os.path.join(PREVIEWS, f"{faction}_{building}_{variant}_levels.png"))
        variants.setdefault(f"{faction}/{building}", []).append(variant)
    export_ts(entries, variants, OUT_TS)
    print(f"{len(entries)} blueprint(s), {len(errors)} error(s) -> {os.path.relpath(OUT_TS, ROOT)}")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
