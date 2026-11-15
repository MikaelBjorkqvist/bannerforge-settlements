"""Kingscross Guild houses (brief: docs/structures/kingscross/house.md, style: docs/styles/kingscross.md v1).

Two designs (owner, 2026-11-15: 2 to start, house position differs, crops are real):
  A  house at the back of the lot, gable to the street, crop and flower garden in front
  B  house in the front-left corner, roof ridge side to side, crop strip down the right side
Levels: 1 cottage (2 beds) · 2 upper floor (3 beds) · 3 prestige details (4 beds): striped guild awning,
flag, hedges, lanterns, yard clutter.
"""
from bfstruct import B, Blueprint, bed_pair, facing, lantern
from kingscross import kit
from kingscross.palette import ROLES

W = 9


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


# ------------------------------------------------------------------ design A


def house_a(level: int) -> Blueprint:
    bp = Blueprint(W, 14, W, name="kingscross/house/a", level=level)
    x0, z0, x1, z1 = 1, 1, 7, 5
    posts = set()  # corners only: the front shows plaster between the windows and the door
    kit.base(bp, x0, z0, x1, z1)
    kit.lower_wall(bp, x0, z0, x1, z1, 1, posts)
    kit.timber_walls(bp, x0, z0, x1, z1, 2, 3, posts, {(2, 5), (6, 5), (1, 3), (7, 3), (4, 1)})
    kit.door(bp, 4, 1, 5)
    kit.beam_ring(bp, x0, z0, x1, z1, 4)

    if level == 1:
        kit.gable_roof(bp, x0, z0, x1, z1, 4, ridge="z")
        kit.chimney(bp, 6, 1, 8)
        beds(bp, (2, 3), 1, head_z=2, foot_z=3)
        bp.set(4, 1, 2, facing("chest", "south"))
        bp.set(5, 1, 2, B("crafting_table"))
        bp.set(5, 2, 2, lantern())
        bp.set(6, 1, 2, facing("smoker", "south"))
        bp.set(6, 1, 3, B("barrel", facing_direction=1, open_bit=False))
        bp.set(6, 2, 3, lantern())
    else:
        bp.fill(2, 4, 2, 6, 4, 4, ROLES["floor"])
        bp.set(6, 4, 4, None)  # ladder hole
        kit.timber_walls(bp, x0, z0, x1, z1, 5, 6, {(4, 5), (4, 1)}, {(2, 5), (6, 5), (1, 3), (7, 3), (3, 1), (5, 1)})
        kit.beam_ring(bp, x0, z0, x1, z1, 7)
        kit.gable_roof(bp, x0, z0, x1, z1, 7, ridge="z")
        kit.chimney(bp, 6, 1, 11)
        ladder(bp, 6, 4, 4, "west")
        beds(bp, (2, 3, 5) if level == 2 else (2, 3, 4, 5), 5, head_z=2, foot_z=3)
        bp.set(6, 5, 2, lantern())
        bp.set(2, 1, 2, B("barrel", facing_direction=1, open_bit=False))
        bp.set(3, 1, 2, facing("chest", "south"))
        bp.set(4, 1, 2, facing("chest", "south"))
        bp.set(5, 1, 2, B("crafting_table"))
        bp.set(5, 2, 2, lantern())
        bp.set(6, 1, 2, facing("smoker", "south"))
        bp.set(3, 3, 3, lantern(hanging=True))

    # Yard: path, fence with gate, lantern posts, real crops, flowers.
    for z in (6, 7, 8):
        bp.set(4, 0, z, ROLES["path"])
    kit.fence_line(bp, [(x, 8) for x in range(1, 8) if x != 4] + [(0, 6), (0, 7), (8, 6), (8, 7)], gate=(4, 8))
    kit.lantern_post(bp, 8, 8)
    kit.crops(bp, [(5, 7), (6, 7), (7, 7)] + ([(5, 6), (6, 6)] if level >= 2 else []), water=(7, 6))
    for (x, z, f) in [(1, 7, "cornflower"), (2, 7, "poppy"), (1, 6, "dandelion")] + ([(3, 7, "cornflower"), (2, 6, "oxeye_daisy")] if level >= 2 else []):
        bp.set(x, 1, z, B(f))
    if level >= 3:
        kit.awning(bp, 3, 5, 3, 6)
        bp.set(3, 1, 6, lantern())
        bp.set(5, 1, 6, B("hay_block", pillar_axis="y"))
        for (x, z) in [(0, 6), (0, 7), (8, 6), (8, 7)]:
            bp.set(x, 1, z, B("oak_leaves", persistent_bit=True, update_bit=False))
        kit.flag_pole(bp, 0, 8, 5, dx=1)
    else:
        kit.lantern_post(bp, 0, 8)

    bp.notes = {
        1: ["Design A: house at the back, gable to the street", "2 beds, chest, barrel, crafting table, smoker", "Real crops (wheat, carrots, potatoes), flowers, gate"],
        2: ["Upper floor with 3 beds, ladder", "Bigger garden"],
        3: ["4 beds; blue-and-white guild awning over the door", "Guild flag at the gate, hedges, hay bale, lantern"],
    }[level]
    return bp


# ------------------------------------------------------------------ design B


def house_b(level: int) -> Blueprint:
    bp = Blueprint(W, 14, W, name="kingscross/house/b", level=level)
    x0, z0, x1, z1 = 1, 1, 6, 6
    posts = set()
    kit.base(bp, x0, z0, x1, z1)
    kit.lower_wall(bp, x0, z0, x1, z1, 1, posts)
    kit.timber_walls(bp, x0, z0, x1, z1, 2, 3, posts, {(5, 6), (1, 3), (1, 4), (6, 3), (3, 1), (4, 1)})
    kit.door(bp, 3, 1, 6)
    kit.beam_ring(bp, x0, z0, x1, z1, 4)

    if level == 1:
        kit.gable_roof(bp, x0, z0, x1, z1, 4, ridge="x")
        kit.chimney(bp, 2, 1, 8)
        beds(bp, (4, 5), 1, head_z=2, foot_z=3)
        bp.set(2, 1, 2, facing("smoker", "south"))
        bp.set(3, 1, 2, B("crafting_table"))
        bp.set(3, 2, 2, lantern())
        bp.set(2, 1, 4, B("barrel", facing_direction=1, open_bit=False))
        bp.set(2, 2, 4, lantern())
        bp.set(5, 1, 5, facing("chest", "west"))
    else:
        bp.fill(2, 4, 2, 5, 4, 5, ROLES["floor"])
        bp.set(5, 4, 5, None)  # ladder hole
        kit.timber_walls(bp, x0, z0, x1, z1, 5, 6, posts, {(3, 6), (5, 6), (1, 3), (6, 4), (4, 1)})
        kit.beam_ring(bp, x0, z0, x1, z1, 7)
        kit.gable_roof(bp, x0, z0, x1, z1, 7, ridge="x")
        kit.chimney(bp, 2, 1, 11)
        ladder(bp, 5, 5, 4, "west")
        beds(bp, (2, 3, 4) if level == 2 else (2, 3, 4, 5), 5, head_z=2, foot_z=3)
        bp.set(2, 5, 5, lantern())
        bp.set(2, 1, 2, facing("smoker", "south"))
        bp.set(3, 1, 2, B("crafting_table"))
        bp.set(3, 2, 2, lantern())
        bp.set(4, 1, 2, facing("chest", "south"))
        bp.set(5, 1, 2, facing("chest", "south"))
        bp.set(2, 1, 4, B("barrel", facing_direction=1, open_bit=False))
        bp.set(2, 2, 4, lantern())
        bp.set(4, 3, 4, lantern(hanging=True))

    # Yard: front strip with path and flowers, crop strip down the right side.
    for z in (7, 8):
        bp.set(3, 0, z, ROLES["path"])
    side = [(8, z) for z in range(0, 8)] + [(7, 0)]
    kit.fence_line(bp, [(x, 8) for x in range(1, 8) if x != 3] + [(0, 7)] + side, gate=(3, 8))
    kit.lantern_post(bp, 8, 8)
    kit.crops(bp, [(7, 1), (7, 2), (7, 4), (7, 5), (7, 6)], water=(7, 3))
    for (x, z, f) in [(1, 7, "cornflower"), (2, 7, "poppy"), (5, 7, "dandelion")] + ([(4, 7, "cornflower")] if level >= 2 else []):
        bp.set(x, 1, z, B(f))
    if level >= 3:
        for x in (2, 4):  # porch posts
            bp.set(x, 1, 7, ROLES["fence"])
            bp.set(x, 2, 7, ROLES["fence"])
        kit.awning(bp, 2, 4, 3, 7)
        bp.set(6, 1, 7, B("hay_block", pillar_axis="y"))
        bp.set(5, 1, 7, B("barrel", facing_direction=1, open_bit=False))
        for z in range(1, 7):
            bp.set(8, 1, z, B("oak_leaves", persistent_bit=True, update_bit=False))
        kit.flag_pole(bp, 0, 8, 5, dx=1)
    else:
        kit.lantern_post(bp, 0, 8)

    bp.notes = {
        1: ["Design B: house in the front-left corner, ridge side to side", "2 beds, chest, barrel, crafting table, smoker", "Crop strip down the right side (real crops)"],
        2: ["Upper floor with 3 beds, ladder"],
        3: ["4 beds; porch with blue-and-white awning", "Guild flag, hedge along the crops, hay and barrel"],
    }[level]
    return bp


def blueprints_a():
    return [house_a(level) for level in (1, 2, 3)]


def blueprints_b():
    return [house_b(level) for level in (1, 2, 3)]
