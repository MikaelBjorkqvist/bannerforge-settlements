"""Kingscross Guild houses (brief: docs/structures/kingscross/house.md, style: docs/styles/kingscross.md v1).

Lot: medium plot 13 x 13 (docs/BUILDINGS.md; owner confirmed 2026-11-15).
Two designs (owner, 2026-11-15: 2 to start, house position differs, crops are real):
  A  house at the back of the lot, gable to the street, crop and flower garden in front
  B  house in the front-left corner, roof ridge side to side, crop garden down the right side, back yard
Levels: 1 cottage (2 beds) · 2 upper floor (3 beds) · 3 prestige details (4 beds): striped guild awning or
porch, guild flag, hedges, lanterns, yard clutter.
"""
from bfstruct import B, Blueprint, bed_pair, facing, lantern
from kingscross import kit
from kingscross.palette import ROLES

W = 13
H = 16


def beds(bp, xs, y, head_z, foot_z):
    for x in xs:
        foot, head = bed_pair("north" if head_z < foot_z else "south")
        bp.set(x, y, foot_z, foot)
        bp.set(x, y, head_z, head)


def ladder(bp, x, z, y_top, toward):
    """Ladder from the ground floor up to y_top; `toward` = which way it faces (away from its wall)."""
    f = {"west": 4, "east": 5, "north": 2, "south": 3}[toward]
    for y in range(1, y_top + 1):
        bp.set(x, y, z, B("ladder", facing_direction=f))


def barrel(bp, x, y, z):
    bp.set(x, y, z, B("barrel", facing_direction=1, open_bit=False))


def hedge(bp, x, z):
    bp.set(x, 1, z, B("oak_leaves", persistent_bit=True, update_bit=False))


def flowers(bp, spots):
    for (x, z, f) in spots:
        bp.set(x, 1, z, B(f))


def table(bp, x, z):
    bp.set(x, 1, z, B("spruce_fence"))
    bp.set(x, 2, z, B("spruce_slab", **{"minecraft:vertical_half": "bottom"}))


# ------------------------------------------------------------------ design A


def house_a(level: int) -> Blueprint:
    bp = Blueprint(W, H, W, name="kingscross/house/a", level=level)
    x0, z0, x1, z1 = 2, 1, 10, 7  # 9 x 7 house at the back
    posts = {(5, 7), (7, 7)}      # door frame; plaster stays visible at x 4 and 8
    win1 = {(3, 7), (9, 7), (2, 3), (2, 5), (10, 3), (10, 5), (4, 1), (8, 1)}
    kit.base(bp, x0, z0, x1, z1)
    kit.lower_wall(bp, x0, z0, x1, z1, 1, posts)
    kit.timber_walls(bp, x0, z0, x1, z1, 2, 3, posts, win1)
    kit.door(bp, 6, 1, 7)
    kit.beam_ring(bp, x0, z0, x1, z1, 4)

    # Ground floor: kitchen corner by the chimney, storage, a table.
    bp.set(9, 1, 2, facing("smoker", "south"))
    bp.set(8, 1, 2, B("crafting_table"))
    bp.set(8, 2, 2, lantern())
    bp.set(7, 1, 2, facing("chest", "south"))
    barrel(bp, 9, 1, 3)
    bp.set(9, 2, 3, lantern())
    table(bp, 5, 4)

    if level == 1:
        kit.gable_roof(bp, x0, z0, x1, z1, 4, ridge="z")
        kit.chimney(bp, 9, 1, 10)
        beds(bp, (3, 4), 1, head_z=2, foot_z=3)
        bp.set(3, 1, 5, B("bookshelf"))
        bp.set(3, 2, 5, lantern())
    else:
        bp.fill(3, 4, 2, 9, 4, 6, ROLES["floor"])
        bp.set(9, 4, 6, None)  # ladder hole
        kit.timber_walls(bp, x0, z0, x1, z1, 5, 6, {(6, 7), (6, 1)}, {(3, 7), (4, 7), (8, 7), (9, 7), (2, 4), (10, 4), (4, 1), (8, 1)})
        kit.beam_ring(bp, x0, z0, x1, z1, 7)
        kit.gable_roof(bp, x0, z0, x1, z1, 7, ridge="z")
        kit.chimney(bp, 9, 1, 13)
        ladder(bp, 9, 6, 4, "west")
        beds(bp, (3, 4, 6) if level == 2 else (3, 4, 6, 7), 5, head_z=2, foot_z=3)
        bp.set(8, 5, 2, facing("chest", "south"))
        bp.set(3, 5, 6, lantern())
        bp.set(7, 5, 6, lantern())
        bp.set(3, 1, 2, facing("chest", "south"))
        barrel(bp, 4, 1, 2)
        bp.set(3, 1, 6, B("bookshelf"))
        bp.set(3, 2, 6, lantern())
        bp.set(6, 3, 4, lantern(hanging=True))

    # Front yard: path, fence with gate, lantern posts, real crops, flowers.
    for z in range(8, 13):
        bp.set(6, 0, z, ROLES["path"])
    kit.fence_line(bp, [(x, 12) for x in range(1, 12) if x != 6] + [(0, z) for z in range(8, 12)] + [(12, z) for z in range(8, 12)], gate=(6, 12))
    kit.lantern_post(bp, 12, 12)
    cells = [(x, z) for x in (8, 9, 10, 11) for z in (9, 10, 11) if (x, z) != (9, 10)]
    if level == 1:
        cells = [c for c in cells if c[1] != 9]
    kit.crops(bp, cells, water=(9, 10))
    flowers(bp, [(2, 9, "cornflower"), (3, 9, "poppy"), (2, 10, "dandelion"), (4, 10, "cornflower")]
            + ([(3, 11, "oxeye_daisy"), (4, 9, "poppy")] if level >= 2 else []))
    bp.set(1, 1, 9, B("hay_block", pillar_axis="y"))
    barrel(bp, 1, 1, 10)
    if level >= 3:
        kit.awning(bp, 5, 7, 3, 8)
        bp.set(5, 1, 8, lantern())
        bp.set(7, 1, 8, lantern())
        for z in range(8, 12):
            hedge(bp, 0, z)
            hedge(bp, 12, z)
        kit.flag_pole(bp, 0, 12, 6, dx=1)
    else:
        kit.lantern_post(bp, 0, 12)

    bp.notes = {
        1: ["Design A: house at the back, gable to the street", "2 beds, table, chest, barrel, bookshelf, smoker", "Front garden: real crops, flowers, hay, gate"],
        2: ["Upper floor: 3 beds and a chest, ladder", "Bigger crop patch"],
        3: ["4 beds; blue-and-white guild awning, door lanterns", "Guild flag at the gate, hedges along the yard"],
    }[level]
    return bp


# ------------------------------------------------------------------ design B


def house_b(level: int) -> Blueprint:
    bp = Blueprint(W, H, W, name="kingscross/house/b", level=level)
    x0, z0, x1, z1 = 1, 3, 8, 10  # 8 x 8 house in the front-left corner
    win1 = {(2, 10), (6, 10), (1, 5), (1, 8), (8, 5), (8, 8), (4, 3), (6, 3)}
    kit.base(bp, x0, z0, x1, z1)
    kit.lower_wall(bp, x0, z0, x1, z1, 1)
    kit.timber_walls(bp, x0, z0, x1, z1, 2, 3, set(), win1)
    kit.door(bp, 4, 1, 10)
    kit.beam_ring(bp, x0, z0, x1, z1, 4)

    bp.set(2, 1, 4, facing("smoker", "south"))
    bp.set(3, 1, 4, B("crafting_table"))
    bp.set(3, 2, 4, lantern())
    barrel(bp, 2, 1, 6)
    bp.set(2, 2, 6, lantern())
    bp.set(7, 1, 9, facing("chest", "west"))
    table(bp, 5, 7)

    if level == 1:
        kit.gable_roof(bp, x0, z0, x1, z1, 4, ridge="x")
        kit.chimney(bp, 2, 3, 9)
        beds(bp, (6, 7), 1, head_z=4, foot_z=5)
        bp.set(7, 1, 7, B("bookshelf"))
        bp.set(7, 2, 7, lantern())
    else:
        bp.fill(2, 4, 4, 7, 4, 9, ROLES["floor"])
        bp.set(7, 4, 8, None)  # ladder hole
        kit.timber_walls(bp, x0, z0, x1, z1, 5, 6, set(), {(3, 10), (6, 10), (1, 6), (8, 6), (4, 3), (6, 3)})
        kit.beam_ring(bp, x0, z0, x1, z1, 7)
        kit.gable_roof(bp, x0, z0, x1, z1, 7, ridge="x")
        kit.chimney(bp, 2, 3, 12)
        ladder(bp, 7, 8, 4, "west")
        beds(bp, (3, 4, 5) if level == 2 else (3, 4, 5, 6), 5, head_z=4, foot_z=5)
        bp.set(2, 5, 9, facing("chest", "east"))
        bp.set(2, 5, 7, lantern())
        bp.set(6, 5, 9, lantern())
        bp.set(6, 1, 4, facing("chest", "south"))
        bp.set(7, 1, 4, B("bookshelf"))
        bp.set(7, 2, 4, lantern())
        bp.set(4, 3, 7, lantern(hanging=True))

    # Front strip with path, crop garden down the right side, back yard with hay and barrels.
    for z in (11, 12):
        bp.set(4, 0, z, ROLES["path"])
    fence = [(x, 12) for x in range(1, 12) if x != 4] + [(12, z) for z in range(0, 12)] + [(x, 0) for x in range(0, 12)] + [(0, 1), (0, 2), (0, 11)]
    kit.fence_line(bp, fence, gate=(4, 12))
    kit.lantern_post(bp, 12, 12)
    cells = [(x, z) for x in (10, 11) for z in range(2, 10) if (x, z) != (10, 5)]
    if level == 1:
        cells = [c for c in cells if c[1] <= 8]
    kit.crops(bp, cells, water=(10, 5), kinds=("wheat", "carrots", "potatoes", "beetroot"))
    flowers(bp, [(2, 11, "cornflower"), (3, 11, "poppy"), (6, 11, "dandelion"), (9, 11, "cornflower")]
            + ([(7, 11, "oxeye_daisy"), (9, 1, "poppy")] if level >= 2 else []))
    bp.set(2, 1, 1, B("hay_block", pillar_axis="y"))
    bp.set(3, 1, 1, B("hay_block", pillar_axis="y"))
    barrel(bp, 5, 1, 1)
    bp.set(6, 1, 1, B("composter"))
    for x in (8, 9):  # woodpile
        bp.set(x, 1, 1, B("spruce_log", pillar_axis="x"))
    if level >= 3:
        for x in (3, 5):  # porch posts
            bp.set(x, 1, 11, ROLES["fence"])
            bp.set(x, 2, 11, ROLES["fence"])
        kit.awning(bp, 3, 5, 3, 11)
        for z in range(1, 12):
            hedge(bp, 12, z)
        kit.flag_pole(bp, 0, 12, 6, dx=1)
    else:
        kit.lantern_post(bp, 0, 12)

    bp.notes = {
        1: ["Design B: house in the front-left corner, ridge side to side", "2 beds, table, chest, barrel, bookshelf, smoker", "Crop garden on the right (real crops); back yard: hay, woodpile, composter"],
        2: ["Upper floor: 3 beds and a chest, ladder", "Longer crop rows"],
        3: ["4 beds; porch with blue-and-white awning", "Guild flag, hedge along the garden"],
    }[level]
    return bp


def blueprints_a():
    return [house_a(level) for level in (1, 2, 3)]


def blueprints_b():
    return [house_b(level) for level in (1, 2, 3)]
