"""Kingscross building kit: the recurring parts of the style, shared by every Kingscross building.
Coordinates follow bfstruct (authored facing south: z grows toward the street)."""
from bfstruct import B, Blueprint, door_pair, facing, lantern, log
from kingscross.palette import ROLES, frame, roof, roof_slab, trim, trim_slab


def base(bp: Blueprint, x0, z0, x1, z1):
    """Stone foundation ring at ground level, plank floor inside."""
    bp.ring(x0, z0, x1, z1, 0, ROLES["foundation"])
    bp.fill(x0 + 1, 0, z0 + 1, x1 - 1, 0, z1 - 1, ROLES["floor"])


def is_post(x, z, x0, z0, x1, z1, posts):
    return (x in (x0, x1) and z in (z0, z1)) or (x, z) in posts


def lower_wall(bp, x0, z0, x1, z1, y, posts=()):
    """Cobblestone lower wall with stone-brick corners (first block above the foundation)."""
    for x in range(x0, x1 + 1):
        for z in range(z0, z1 + 1):
            if x in (x0, x1) or z in (z0, z1):
                corner = x in (x0, x1) and z in (z0, z1)
                bp.set(x, y, z, ROLES["corner_stone"] if corner else frame() if (x, z) in posts else ROLES["lower_wall"])


def timber_walls(bp, x0, z0, x1, z1, y0, y1, posts=(), windows=()):
    """Dark posts at the corners and at `posts`, light plaster between; windows on the first row of the band."""
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            for z in range(z0, z1 + 1):
                if not (x in (x0, x1) or z in (z0, z1)):
                    continue
                if is_post(x, z, x0, z0, x1, z1, posts):
                    bp.set(x, y, z, frame())
                elif (x, z) in windows and y == y0:
                    bp.set(x, y, z, ROLES["window"])
                else:
                    bp.set(x, y, z, ROLES["wall"])


def beam_ring(bp, x0, z0, x1, z1, y):
    for x in range(x0, x1 + 1):
        for z in range(z0, z1 + 1):
            if x in (x0, x1) and z in (z0, z1):
                bp.set(x, y, z, frame("y"))
            elif z in (z0, z1):
                bp.set(x, y, z, frame("x"))
            elif x in (x0, x1):
                bp.set(x, y, z, frame("z"))


def gable_roof(bp, x0, z0, x1, z1, y, ridge="z", gable_window=True):
    """Gable roof over walls x0..x1 / z0..z1 starting at height y, 1-block overhang all round.
    ridge="z": ridge runs back to front, slopes face west/east, gables face the street and the back.
    ridge="x": ridge runs side to side, slopes face the street and the back, gables face the sides.
    Verges (the overhang rows past the gables) are stone-brick trim; the surface is dark wood."""
    if ridge == "z":
        a0, a1, b0, b1 = x0, x1, z0, z1  # a = across the slope, b = along the ridge
    else:
        a0, a1, b0, b1 = z0, z1, x0, x1
    lo, hi = a0 - 1, a1 + 1
    k = 0
    while lo <= hi:
        for b in range(b0 - 1, b1 + 2):
            verge = b in (b0 - 1, b1 + 1)
            make = trim if verge else roof
            if lo == hi:
                put(bp, ridge, lo, y + k, b, trim_slab() if verge else roof_slab())
            else:
                put(bp, ridge, lo, y + k, b, make("east" if ridge == "z" else "south"))
                put(bp, ridge, hi, y + k, b, make("west" if ridge == "z" else "north"))
        # Gable infill on the two end walls, level with this roof row (the first row sits on the beams).
        if k >= 1:
            for b in (b0, b1):
                for a in range(lo + 1, hi):
                    put(bp, ridge, a, y + k, b, ROLES["wall"])
        lo, hi, k = lo + 1, hi - 1, k + 1
    # Gable details: odd widths get a centre post with a window above; even widths a pair of windows.
    mid = (a0 + a1) // 2
    for b in (b0, b1):
        if (a1 - a0) % 2 == 0:
            put(bp, ridge, mid, y + 1, b, frame())
            if gable_window and (a1 - a0) >= 4:
                put(bp, ridge, mid, y + 2, b, ROLES["window"])
        elif gable_window:
            put(bp, ridge, mid, y + 1, b, ROLES["window"])
            put(bp, ridge, mid + 1, y + 1, b, ROLES["window"])
    return y + k


def put(bp, ridge, a, y, b, block):
    if ridge == "z":
        if 0 <= a < bp.w and 0 <= b < bp.d and 0 <= y < bp.h:
            bp.set(a, y, b, block)
    else:
        if 0 <= b < bp.w and 0 <= a < bp.d and 0 <= y < bp.h:
            bp.set(b, y, a, block)


def chimney(bp, x, z, top):
    """Brick chimney from the ground floor to `top`, with a campfire for smoke."""
    for y in range(1, top + 1):
        bp.set(x, y, z, ROLES["chimney"])
    bp.set(x, top + 1, z, facing("campfire", "south", extinguished=False))


def door(bp, x, y, z, toward="south"):
    lo, up = door_pair("spruce", toward)
    bp.set(x, y, z, lo)
    bp.set(x, y + 1, z, up)


def awning(bp, x0, x1, y, z):
    """Blue-and-white striped wool awning (guild colour without banners)."""
    for i, x in enumerate(range(x0, x1 + 1)):
        bp.set(x, y, z, ROLES["accent"] if i % 2 == 0 else ROLES["accent_light"])


def flag_pole(bp, x, z, height, dx=1):
    """Fence pole with a blue-and-white wool flag at the top, flying toward dx (+1 east, -1 west)."""
    for y in range(1, height + 1):
        bp.set(x, y, z, ROLES["fence"])
    bp.set(x + dx, height, z, ROLES["accent"])
    bp.set(x + dx, height - 1, z, ROLES["accent"])
    bp.set(x + 2 * dx, height, z, ROLES["accent_light"])


def lantern_post(bp, x, z):
    bp.set(x, 1, z, log(ROLES["frame"]))
    bp.set(x, 2, z, lantern())


def crops(bp, cells, water, kinds=("wheat", "carrots", "potatoes")):
    """Real, harvestable crops (owner, 2026-11-15) on farmland, watered from a covered spring."""
    for i, (x, z) in enumerate(cells):
        bp.set(x, 0, z, B("farmland", moisturized_amount=7))
        bp.set(x, 1, z, B(kinds[i % len(kinds)], growth=7))
    wx, wz = water
    bp.set(wx, 0, wz, B("water"))
    bp.set(wx, 1, wz, B("spruce_trapdoor", direction=3, upside_down_bit=False, open_bit=False))


def fence_line(bp, cells, gate=None, gate_facing="south"):
    for (x, z) in cells:
        bp.set(x, 1, z, ROLES["fence"])
    if gate:
        bp.set(gate[0], 1, gate[1], facing("spruce_fence_gate", gate_facing, in_wall_bit=False, open_bit=False))
