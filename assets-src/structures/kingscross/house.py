"""Kingscross Guild house, variant A (brief: docs/structures/kingscross/house.md).
PIPELINE DRAFT: proves generator -> previews -> game. The real design follows the owner's answers.

Lot 9 x 9: the house stands at the back (x 1..7, z 1..5), the yard with path, garden and fence at the front.
Timber frame on a stone base: cobblestone lower wall, oak plank infill, dark oak posts and beams,
steep oak gable roof with the gable facing the street, cobblestone chimney with a campfire for smoke.
Levels: 1 = cottage (2 beds), 2 = upper floor (3 beds), 3 = porch, awning, hedges (4 beds).
"""
from bfstruct import AIR, B, Blueprint, bed_pair, door_pair, facing, lantern, log, trapdoor
from kingscross.palette import ROLES, frame, roof, roof_slab

W = 9


def walls(bp, y0, y1, windows):
    """Frame posts at the corners and beside the door, plank infill, windows at the given (x, z) spots."""
    for y in range(y0, y1 + 1):
        for x in range(1, 8):
            for z in range(1, 6):
                if x in (1, 7) or z in (1, 5):
                    post = (x in (1, 7) and z in (1, 5)) or (z == 5 and x in (3, 5))
                    bp.set(x, y, z, frame() if post else (ROLES["window"] if (x, z) in windows and y == y0 else ROLES["wall"]))


def beam_ring(bp, y):
    for x in range(1, 8):
        for z in range(1, 6):
            if x in (1, 7) and z in (1, 5):
                bp.set(x, y, z, frame("y"))
            elif z in (1, 5):
                bp.set(x, y, z, frame("x"))
            elif x in (1, 7):
                bp.set(x, y, z, frame("z"))


def gable_roof(bp, y):
    """Roof ridge runs back to front; gables face the street and the back. Overhangs 1 block all round."""
    for z in range(0, 7):
        for i, (xl, xr) in enumerate(((0, 8), (1, 7), (2, 6), (3, 5))):
            bp.set(xl, y + i, z, roof("east"))
            bp.set(xr, y + i, z, roof("west"))
        bp.set(4, y + 4, z, roof_slab())
    for z in (1, 5):  # gable infill
        for i, (xa, xb) in enumerate(((2, 6), (3, 5), (4, 4))):
            for x in range(xa, xb + 1):
                bp.set(x, y + 1 + i, z, ROLES["wall"])
        bp.set(4, y + 1, z, frame())
        bp.set(4, y + 2, z, ROLES["window"])


def chimney(bp, top):
    for y in range(1, top + 1):
        bp.set(6, y, 1, ROLES["foundation_alt"])
    bp.set(6, top + 1, 1, facing("campfire", "south", extinguished=False))


def yard(bp, level):
    for z in (6, 7, 8):
        bp.set(4, 0, z, ROLES["path"])
    for x in range(0, 9):
        if x != 4:
            bp.set(x, 1, 8, ROLES["fence"])
    bp.set(4, 1, 8, facing("fence_gate", "south", in_wall_bit=False, open_bit=False))
    for z in (6, 7):
        bp.set(0, 1, z, ROLES["fence"])
        bp.set(8, 1, z, ROLES["fence"])
    for x in (0, 8):  # lantern posts at the gate corners
        bp.set(x, 1, 8, log("dark_oak"))
        bp.set(x, 2, 8, lantern())
    # Garden: crops on farmland, watered from a covered spring.
    for x in (5, 6, 7):
        bp.set(x, 0, 7, B("farmland", moisturized_amount=7))
        bp.set(x, 1, 7, B("wheat" if x != 6 else "carrots", growth=7))
    bp.set(7, 0, 6, B("water"))
    bp.set(7, 1, 6, trapdoor("oak", "north"))
    bp.set(1, 1, 7, B("cornflower"))
    bp.set(2, 1, 7, B("poppy"))
    if level >= 2:
        bp.set(1, 1, 6, B("dandelion"))
        bp.set(3, 1, 7, B("cornflower"))
        bp.set(5, 0, 6, B("farmland", moisturized_amount=7))
        bp.set(5, 1, 6, B("potatoes", growth=7))
    if level >= 3:  # hedges replace the side fences
        for z in (6, 7):
            for x in (0, 8):
                bp.set(x, 1, z, B("oak_leaves", persistent_bit=True, update_bit=False))


def house(level: int) -> Blueprint:
    bp = Blueprint(W, 14, W, name="kingscross/house/a", level=level)
    # Ground: stone base ring and plank floor.
    bp.ring(1, 1, 7, 5, 0, ROLES["foundation"])
    bp.fill(2, 0, 2, 6, 0, 4, ROLES["floor"])
    # Lower wall of cobblestone, frame posts.
    for x in range(1, 8):
        for z in range(1, 6):
            if x in (1, 7) or z in (1, 5):
                post = (x in (1, 7) and z in (1, 5)) or (z == 5 and x in (3, 5))
                bp.set(x, 1, z, frame() if post else ROLES["lower_wall"])
    walls(bp, 2, 3, {(2, 5), (6, 5), (1, 3), (7, 3), (4, 1)})
    lo, up = door_pair("oak", "south")
    bp.set(4, 1, 5, lo)
    bp.set(4, 2, 5, up)
    beam_ring(bp, 4)

    if level == 1:
        gable_roof(bp, 4)
        chimney(bp, 8)
        for x in (2, 3):  # two beds at the back
            foot, head = bed_pair("north")
            bp.set(x, 1, 3, foot)
            bp.set(x, 1, 2, head)
        bp.set(4, 1, 2, facing("chest", "south"))
        bp.set(5, 1, 2, B("crafting_table"))
        bp.set(5, 2, 2, lantern())
        bp.set(6, 1, 2, facing("furnace", "south"))
        bp.set(6, 1, 3, B("barrel", facing_direction=1, open_bit=False))
        bp.set(6, 2, 3, lantern())
    else:
        # Upper floor: plank floor at the beam, walls, a second beam, roof higher up.
        bp.fill(2, 4, 2, 6, 4, 4, ROLES["floor"])
        bp.set(6, 4, 4, AIR)  # ladder hole
        walls(bp, 5, 6, {(2, 5), (6, 5), (1, 3), (7, 3), (2, 1), (6, 1)})
        beam_ring(bp, 7)
        gable_roof(bp, 7)
        chimney(bp, 11)
        for y in range(1, 5):  # ladder against the east wall
            bp.set(6, y, 4, B("ladder", facing_direction=4))
        beds = (2, 3, 5) if level == 2 else (2, 3, 4, 5)
        for x in beds:
            foot, head = bed_pair("north")
            bp.set(x, 5, 3, foot)
            bp.set(x, 5, 2, head)
        bp.set(6, 5, 3, lantern())
        bp.set(2, 1, 2, B("barrel", facing_direction=1, open_bit=False))
        bp.set(3, 1, 2, facing("chest", "south"))
        bp.set(4, 1, 2, facing("chest", "south"))
        bp.set(5, 1, 2, B("crafting_table"))
        bp.set(5, 2, 2, lantern())
        bp.set(6, 1, 2, facing("furnace", "south"))
        bp.set(3, 3, 3, lantern(hanging=True))
        # Guild cloth beside the upper front windows (blue, until real banners are possible).
        bp.set(3, 5, 5, ROLES["accent"])
        bp.set(5, 5, 5, ROLES["accent"])
        if level >= 3:
            for x in (3, 4, 5):  # blue awning over the door
                bp.set(x, 3, 6, ROLES["accent"])
            bp.set(2, 1, 6, lantern())
            bp.set(6, 1, 6, lantern())
    yard(bp, level)
    bp.notes = {
        1: ["Cottage: 2 beds, chest, barrel, crafting table, furnace", "Front garden: wheat + carrots, flowers, gate with lantern posts"],
        2: ["Upper floor with 3 beds, ladder", "Blue guild cloth on the front, more garden"],
        3: ["4 beds, blue awning over the door", "Hedges along the yard, lanterns by the door"],
    }[level]
    return bp


def blueprints():
    return [house(level) for level in (1, 2, 3)]
