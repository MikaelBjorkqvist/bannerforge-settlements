"""Roof builder for generated buildings (docs/styles/medieval_principles.md).

roof(bp, box, y, ridge, kind, ...) covers walls box = (x0, z0, x1, z1) from height y with a 1-block overhang.
  ridge "z": ridge runs back to front (gables or hips at back and front); "x": ridge runs side to side.
  kind: "gable", "half_hip" (gable below, hipped above), "hip".
Depth and weathering built in: darker wood on the eave row (water), main wood above, stone-brick verges and
ridge, upside-down stairs under the eaves as rafters, plaster gable infill with a centre post.
"""
from bfstruct import B, Block
from kingscross.palette import ROLES, frame

EAVE = "dark_oak"
MAIN = "spruce"
TRIM = "stone_brick"
_W = {"east": 0, "west": 1, "south": 2, "north": 3}


def st(material, rises, upside=False):
    return B(f"{material}_stairs", weirdo_direction=_W[rises], upside_down_bit=upside)


def sl(material, top=False):
    return B(f"{material}_slab", **{"minecraft:vertical_half": "top" if top else "bottom"})


class Roof:
    def __init__(self, bp, ridge, keep=None, soft=False):
        self.bp, self.ridge, self.keep, self.soft = bp, ridge, keep, soft

    def put(self, a, y, b, block: Block, force=True):
        force = force and not self.soft
        x, z = (a, b) if self.ridge == "z" else (b, a)
        if not (0 <= x < self.bp.w and 0 <= z < self.bp.d and 0 <= y < self.bp.h):
            return
        if self.keep and not self.keep(x, y, z):
            return
        if force or self.bp.get(x, y, z) is None:
            self.bp.set(x, y, z, block)

    # directions in (a, b) terms
    def up_a(self, positive):  # rises toward +a or -a
        if self.ridge == "z":
            return "east" if positive else "west"
        return "south" if positive else "north"

    def up_b(self, positive):
        if self.ridge == "z":
            return "south" if positive else "north"
        return "east" if positive else "west"


def roof(bp, box, y, ridge="z", kind="gable", keep=None, rafters=True, gable_window=True, infill=True, soft=False):
    x0, z0, x1, z1 = box
    a0, a1, b0, b1 = (x0, x1, z0, z1) if ridge == "z" else (z0, z1, x0, x1)
    R = Roof(bp, ridge, keep, soft)
    lo, hi, k = a0 - 1, a1 + 1, 0
    half = (hi - lo) // 2
    switch = 0 if kind == "hip" else (max(1, half - 1) if kind == "half_hip" else 10 ** 6)
    top = y
    while lo <= hi:
        if kind == "hip":
            inset = k  # hipped all round: the ends step in with every row, eaves on all four sides
        elif kind == "half_hip":
            inset = max(0, k - switch + 1)
        else:
            inset = 0
        bl, br = b0 - 1 + inset, b1 + 1 - inset
        if bl > br:
            break
        hipped_here = inset > 0 or kind == "hip"
        for b in range(bl, br + 1):
            verge = (not hipped_here) and kind != "hip" and b in (b0 - 1, b1 + 1)
            mat = TRIM if verge else (EAVE if k == 0 else MAIN)
            if lo == hi:
                R.put(lo, y + k, b, sl(TRIM if verge or b in (bl, br) else MAIN))
            else:
                R.put(lo, y + k, b, st(mat, R.up_a(True)))
                R.put(hi, y + k, b, st(mat, R.up_a(False)))
                if k == 0 and rafters:
                    R.put(lo, y - 1, b, st(EAVE, R.up_a(True), upside=True), force=False)
                    R.put(hi, y - 1, b, st(EAVE, R.up_a(False), upside=True), force=False)
        if hipped_here:  # hip ends: stairs rising inward along the ridge
            for a in range(lo + 1, hi):
                mat = EAVE if k == 0 else MAIN
                R.put(a, y + k, bl, st(mat, R.up_b(True)))
                R.put(a, y + k, br, st(mat, R.up_b(False)))
        elif infill and k >= 1:  # gable infill on the end walls
            for b in (b0, b1):
                for a in range(lo + 1, hi):
                    R.put(a, y + k, b, ROLES["wall"])
        top = y + k
        lo, hi, k = lo + 1, hi - 1, k + 1
    # Gable details: centre post with a window above (odd widths) or a pair of windows (even widths).
    if kind != "hip" and infill:
        mid = (a0 + a1) // 2
        for b in (b0, b1):
            if (a1 - a0) % 2 == 0:
                R.put(mid, y + 1, b, frame())
                if gable_window and a1 - a0 >= 4:
                    R.put(mid, y + 2, b, ROLES["window"])
            elif gable_window and a1 - a0 >= 3:
                R.put(mid, y + 1, b, ROLES["window"])
                R.put(mid + 1, y + 1, b, ROLES["window"])
    return top


def catslide(bp, main_box, y, ridge, side, length, keep=None):
    """Continues one slope of a gable roof `length` rows further down (saltbox roof over a lean-to)."""
    x0, z0, x1, z1 = main_box
    a0, a1, b0, b1 = (x0, x1, z0, z1) if ridge == "z" else (z0, z1, x0, x1)
    R = Roof(bp, ridge, keep)
    for i in range(1, length + 1):
        a = (a1 + 1 + i) if side > 0 else (a0 - 1 - i)
        for b in range(b0 - 1, b1 + 2):
            verge = b in (b0 - 1, b1 + 1)
            mat = TRIM if verge else (EAVE if i == length else MAIN)
            R.put(a, y - i, b, st(mat, R.up_a(side < 0)))
            if i == length:
                R.put(a, y - i - 1, b, st(EAVE, R.up_a(side < 0), upside=True), force=False)
    # Clear the old eave rafters that are now inside the lean-to.
    a_old = a1 + 1 if side > 0 else a0 - 1
    for b in range(b0 - 1, b1 + 2):
        x, z = (a_old, b) if ridge == "z" else (b, a_old)
        g = bp.get(x, y - 1, z)
        if g is not None and "stairs" in g.id and g.state("upside_down_bit"):
            bp.set(x, y - 1, z, None)
