"""Kingscross Guild house GENERATOR v2 (docs/STRUCTURES.md; principles: docs/styles/medieval_principles.md).

v1 lesson (owner, 2026-11-15): "all houses are way too similar, attention to detail is missing".
v2 starts from building TYPES with different silhouettes, then roof forms, then detail passes:
  types   cottage (low walls, tall roof, dormers) · townhouse (narrow, tall, jettied, gable to street) ·
          L-house (main + wing, cross gable) · longhouse (long, eaves to street, half-hipped/hipped) ·
          saltbox (two storeys, long catslide over a back lean-to) · tower house (corner tower)
  roofs   gable, half-hipped, hipped (towers), catslide, shed dormers, cross-gabled porch, pentice
  details rafters under eaves, two-wood roofs, stone verges, shutters (varied), sills or planters,
          beam ends, jetty brackets, clustered weathering at bases and corners, door step, lanterns,
          banners, mixed paths, small trees, wells, woodpiles, crops (real), benches, hedges
Faction DNA stays: stone base, dark timber, light plaster, guild blue (banners, striped awnings, flags).
Lot 13 x 13, authored facing south (z = 12 is the street). One seed = one design, levels 1-3.
"""
from __future__ import annotations

import random

from bfstruct import B, Blueprint, bed_pair, door_pair, facing, lantern
from kingscross import kit
from kingscross.palette import ROLES, frame
from kingscross.roofs import catslide, roof, sl, st

W = 13
H = 20
BANNER = "bannerforge_settlements:banner_blue"
TYPES = ["cottage", "townhouse", "lhouse", "longhouse", "saltbox", "towerhouse"]
TYPE_NAMES = {"cottage": "cottage", "townhouse": "townhouse", "lhouse": "L-house", "longhouse": "longhouse",
              "saltbox": "saltbox", "towerhouse": "tower house"}


class Rules:
    def __init__(self, seed: int):
        r = random.Random(seed * 104729 + 7)
        self.seed, self.r = seed, r
        self.type = TYPES[(seed - 1) % len(TYPES)]
        t = self.type
        if t == "cottage":
            self.w, self.d, self.ridge, self.kind = r.choice([7, 9]), r.choice([5, 6]), "x", r.choice(["gable", "half_hip"])
        elif t == "townhouse":
            self.w, self.d, self.ridge, self.kind = 7, r.choice([6, 7]), "z", "gable"
        elif t == "lhouse":
            self.w, self.d, self.ridge, self.kind = 7, r.choice([5, 6]), r.choice(["x", "z"]), r.choice(["gable", "gable", "half_hip"])
        elif t == "longhouse":
            self.w, self.d, self.ridge, self.kind = r.choice([9, 11]), 5, "x", r.choice(["half_hip", "hip", "gable"])
        elif t == "saltbox":
            self.w, self.d, self.ridge, self.kind = r.choice([7, 9]), 5, "x", "gable"
        else:
            self.w, self.d, self.ridge, self.kind = 7, r.choice([5, 6]), r.choice(["x", "z"]), "gable"
        self.side = r.choice(["left", "right"])
        self.porch = r.choice(["gable", "awning", "pentice"])
        self.shutters = r.choice(["open", "mixed", "none"])
        self.sill = r.choice(["planter", "sill", "planter"])
        self.chimney_block = r.choice(["brick", "brick", "cobble"])
        self.door_shift = r.choice([0, 0, -1, 1]) if self.w >= 9 else 0
        self.tree = r.random() < 0.6
        self.fence = r.choice(["fence", "fence", "hedge"])
        self.feats = r.sample(["crops", "well", "woodpile", "hay", "flowers", "bench"], 6)
        self.weather = r.randint(0, 10_000)

    def describe(self):
        roofname = {"gable": "gable", "half_hip": "half-hipped", "hip": "hipped"}[self.kind]
        street = "gable to street" if self.ridge == "z" else "eaves to street"
        return f"{TYPE_NAMES[self.type]}, {self.w}x{self.d}, {roofname} roof, {street}, {self.porch} porch"


# ------------------------------------------------------------------ helpers


def weathered(rl, x, y, z, base, corners):
    """Clustered weathering: mossy/cracked near the ground and the corners, never random speckle."""
    near = min(abs(x - cx) + abs(z - cz) for (cx, cz) in corners)
    chance = (0.55 if y <= 0 else 0.3) * max(0.0, 1 - near / 4)
    h = ((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ rl.weather) % 1000 / 1000
    if h < chance:
        if base.id.endswith("stone_bricks"):
            return B("cracked_stone_bricks") if h < chance / 2 else B("mossy_stone_bricks")
        if base.id.endswith("cobblestone"):
            return B("mossy_cobblestone")
    return base


def corners_of(box):
    x0, z0, x1, z1 = box
    return [(x0, z0), (x1, z0), (x0, z1), (x1, z1)]


def shell(bp, rl, box, floors, door=None, windows=(), posts=(), skip=frozenset(), jetty_front=False):
    """Foundation, cobblestone lower wall, timber frame with plaster, beam rings; floors between storeys.
    Each storey is 3 blocks (2 of wall + the beam). Returns the y of the top beam ring."""
    x0, z0, x1, z1 = box
    corners = corners_of(box)
    for x in range(x0, x1 + 1):
        for z in range(z0, z1 + 1):
            if (x, z) in skip:
                continue
            edge = x in (x0, x1) or z in (z0, z1)
            bp.set(x, 0, z, weathered(rl, x, 0, z, ROLES["foundation"], corners) if edge else ROLES["floor"])
            if edge:
                c = (x, z) in corners
                bp.set(x, 1, z, ROLES["corner_stone"] if c else frame() if (x, z) in posts else weathered(rl, x, 1, z, ROLES["lower_wall"], corners))
    y = 1
    for f in range(floors):
        fz1 = z1 + (1 if (jetty_front and f >= 1) else 0)
        y_lo = 2 if f == 0 else y + 1
        y_hi = y_lo + 1
        for yy in range(y_lo, y_hi + 1):
            for x in range(x0, x1 + 1):
                for z in range(z0, fz1 + 1):
                    if not (x in (x0, x1) or z in (z0, fz1)) or (x, z) in skip:
                        continue
                    if (x in (x0, x1) and z in (z0, fz1)) or (x, z) in posts:
                        bp.set(x, yy, z, frame())
                    elif (x, z, f) in windows and yy == y_lo:
                        bp.set(x, yy, z, ROLES["window"])
                    else:
                        bp.set(x, yy, z, ROLES["wall"])
        y = y_hi + 1
        for x in range(x0, x1 + 1):
            for z in range(z0, fz1 + 1):
                if (x, z) in skip:
                    continue
                if x in (x0, x1) and z in (z0, fz1):
                    bp.set(x, y, z, frame("y"))
                elif z in (z0, fz1):
                    bp.set(x, y, z, frame("x"))
                elif x in (x0, x1):
                    bp.set(x, y, z, frame("z"))
                elif f < floors - 1:
                    bp.set(x, y, z, ROLES["floor"])
    if door:
        dx, dz = door
        lo, up = door_pair("spruce", "south")
        bp.set(dx, 1, dz, lo)
        bp.set(dx, 2, dz, up)
    return y


def shutter(rl, bp, x, y, z, i):
    """Trapdoor shutter beside a street-facing window, varied open/closed (guides: not identical everywhere)."""
    if rl.shutters == "none" or bp.get(x, y, z + 1) is not None:
        return
    is_open = rl.shutters == "open" or i % 3 != 1
    bp.set(x, y, z + 1, B("spruce_trapdoor", direction=2, upside_down_bit=False, open_bit=is_open))


def front_details(bp, rl, box, door_x, windows):
    """Sills or planters under the ground-floor street windows, shutters beside them, a stone door step."""
    x0, z0, x1, z1 = box
    for i, (x, z, f) in enumerate(sorted(windows)):
        if z != z1 or f != 0:
            continue
        if bp.get(x, 1, z + 1) is None:
            bp.set(x, 1, z + 1, B("azalea_leaves", persistent_bit=True, update_bit=False) if rl.sill == "planter" else st("stone_brick", "north", upside=True))
        for sx in (x - 1, x + 1):
            g = bp.get(sx, 2, z)
            if x0 < sx < x1 and g is not None and "glass" not in g.id and "door" not in g.id:
                shutter(rl, bp, sx, 2, z, i + sx)
    if door_x >= 0:
        bp.set(door_x, 0, z1 + 1, st("stone_brick", "north"))


def beam_ends(bp, box, y):
    x0, z0, x1, z1 = box
    for x in range(x0, x1 + 1, 2):
        if bp.get(x, y, z1 + 1) is None:
            bp.set(x, y, z1 + 1, frame("z"))


def jetty_brackets(bp, box, y):
    x0, z0, x1, z1 = box
    for x in range(x0, x1 + 1, 2):
        if bp.get(x, y - 1, z1 + 1) is None:
            bp.set(x, y - 1, z1 + 1, st("dark_oak", "north", upside=True))


def chimney(bp, rl, x, z, top):
    top = min(top, H - 2)
    blk = ROLES["chimney"] if rl.chimney_block == "brick" else ROLES["foundation_alt"]
    for y in range(1, top + 1):
        bp.set(x, y, z, blk)
    bp.set(x, top + 1, z, facing("campfire", "south", extinguished=False))


def banner(bp, x, y, z):
    bp.set(x, y, z, B(BANNER, **{"bannerforge_settlements:part": "bottom", "minecraft:cardinal_direction": "south"}))
    bp.set(x, y + 1, z, B(BANNER, **{"bannerforge_settlements:part": "top", "minecraft:cardinal_direction": "south"}))


def windows_for(box, floors, door_x, avoid):
    x0, z0, x1, z1 = box
    out = set()
    for f in range(floors):
        for x in range(x0 + 1, x1):
            if (x - x0) % 2 == 1 and abs(x - door_x) >= (2 if f == 0 else 0):
                out.add((x, z1, f))
            if (x - x0) % 2 == 0 and (x, z0) not in avoid:
                out.add((x, z0, f))
        for z in range(z0 + 1, z1):
            if (z - z0) % 2 == 1:
                if (x0, z) not in avoid:
                    out.add((x0, z, f))
                if (x1, z) not in avoid:
                    out.add((x1, z, f))
    return out


def beds(bp, xs, y, zh, zf):
    for x in xs:
        foot, head = bed_pair("north" if zh < zf else "south")
        bp.set(x, y, zf, foot)
        bp.set(x, y, zh, head)


def keep_outside(*boxes):
    def keep(x, y, z):
        return not any(b[0] <= x <= b[2] and b[1] <= z <= b[3] for b in boxes if b)
    return keep


# ------------------------------------------------------------------ yard


def yard(bp, rl, level, solid, door_x, front_z):
    blocked = set()
    for (x0, z0, x1, z1) in solid:
        blocked.update((x, z) for x in range(x0 - 1, x1 + 2) for z in range(z0 - 1, z1 + 2))
    for z in range(front_z + 1, W):  # mixed path, gravel and coarse dirt where it is walked most
        h = (z * 31 + rl.weather) % 7
        bp.set(door_x, 0, z, B("gravel") if h == 0 else B("coarse_dirt") if h == 1 else ROLES["path"])
        blocked.update((door_x + dx, z) for dx in (-1, 0, 1))
    for x in range(W):
        for z in range(W):
            if not (x in (0, W - 1) or z in (0, W - 1)) or (x, z) in ((0, W - 1), (W - 1, W - 1)):
                continue
            if any(b[0] - 1 <= x <= b[2] + 1 and b[1] - 1 <= z <= b[3] + 1 for b in solid):
                continue  # never a fence against a wall
            if (x, z) == (door_x, W - 1):
                bp.set(x, 1, z, facing("spruce_fence_gate", "south", in_wall_bit=False, open_bit=False))
            elif rl.fence == "hedge" and z != W - 1:
                bp.set(x, 1, z, B("oak_leaves", persistent_bit=True, update_bit=False))
            else:
                bp.set(x, 1, z, ROLES["fence"])
    kit.lantern_post(bp, W - 1, W - 1)
    if level >= 3:
        kit.flag_pole(bp, 0, W - 1, 6, dx=1)
    else:
        kit.lantern_post(bp, 0, W - 1)
    blocked |= {(x, z) for x in range(W) for z in range(W) if x in (0, W - 1) or z in (0, W - 1)}

    def fits(x, z, w, d):
        return all(0 <= x + i < W and 0 <= z + j < W and (x + i, z + j) not in blocked for i in range(w) for j in range(d))

    def take(x, z, w, d):
        blocked.update((x + i, z + j) for i in range(-1, w + 1) for j in range(-1, d + 1))

    def find(w, d):
        for z in range(W - 2, 0, -1):
            for x in range(1, W - 1):
                if fits(x, z, w, d):
                    return (x, z)
        return None

    placed = []
    if rl.tree and level >= 2 and (spot := find(3, 3)):
        x, z = spot[0] + 1, spot[1] + 1
        for y in (1, 2, 3):
            bp.set(x, y, z, B("oak_log", pillar_axis="y"))
        for dx in (-1, 0, 1):
            for dz in (-1, 0, 1):
                for y in (4, 5):
                    if not (y == 5 and abs(dx) + abs(dz) == 2):
                        bp.set(x + dx, y, z + dz, B("oak_leaves", persistent_bit=True, update_bit=False))
        bp.set(x, 6, z, B("oak_leaves", persistent_bit=True, update_bit=False))
        take(spot[0], spot[1], 3, 3)
        placed.append("tree")
    feats = ["crops"] + [f for f in rl.feats if f != "crops"]
    if level == 1:
        feats = [f for f in feats if f in ("crops", "flowers", "hay")]
    for feat in feats:
        if feat == "crops":
            for (w, d) in ((5, 3), (3, 5), (3, 3), (3, 2)):
                spot = find(w, d)
                if spot:
                    x, z = spot
                    water = (x + w // 2, z + d // 2)
                    cells = [(x + i, z + j) for i in range(w) for j in range(d) if (x + i, z + j) != water]
                    kit.crops(bp, cells, water=water, kinds=("wheat", "carrots", "potatoes", "beetroot"))
                    take(x, z, w, d)
                    placed.append("crops")
                    break
        elif feat == "well" and level >= 3 and (spot := find(3, 3)):
            x, z = spot
            bp.ring(x, z, x + 2, z + 2, 0, B("cobblestone"))
            bp.ring(x, z, x + 2, z + 2, 1, B("mossy_cobblestone"))
            bp.set(x + 1, 0, z + 1, B("water"))
            for (px, pz) in ((x, z + 1), (x + 2, z + 1)):
                bp.set(px, 2, pz, ROLES["fence"])
                bp.set(px, 3, pz, ROLES["fence"])
            for i in range(3):
                bp.set(x + i, 4, z, st("spruce", "south"))
                bp.set(x + i, 4, z + 2, st("spruce", "north"))
                bp.set(x + i, 4, z + 1, sl("spruce"))
            take(x, z, 3, 3)
            placed.append("well")
        elif feat == "woodpile" and (spot := find(3, 1)):
            x, z = spot
            for i in range(3):
                bp.set(x + i, 1, z, B("spruce_log", pillar_axis="z"))
            bp.set(x + 1, 2, z, B("spruce_log", pillar_axis="z"))
            bp.set(x, 2, z, sl("spruce"))
            take(x, z, 3, 1)
            placed.append("woodpile")
        elif feat == "hay" and (spot := find(2, 2)):
            x, z = spot
            bp.set(x, 1, z, B("hay_block", pillar_axis="y"))
            bp.set(x + 1, 1, z, B("hay_block", pillar_axis="x"))
            bp.set(x, 2, z, B("hay_block", pillar_axis="z"))
            bp.set(x, 1, z + 1, B("barrel", facing_direction=1, open_bit=False))
            bp.set(x + 1, 1, z + 1, B("composter"))
            take(x, z, 2, 2)
            placed.append("hay")
        elif feat == "flowers" and (spot := find(3, 1)):
            x, z = spot
            kinds = ["cornflower", "poppy", "dandelion", "oxeye_daisy", "allium"]
            for i in range(3):
                bp.set(x + i, 1, z, B(kinds[(rl.weather + i) % len(kinds)]))
            take(x, z, 3, 1)
            placed.append("flowers")
        elif feat == "bench" and level >= 2 and (spot := find(2, 1)):
            x, z = spot
            for i in range(2):
                bp.set(x + i, 1, z, st("spruce", "north"))
            take(x, z, 2, 1)
            placed.append("bench")
    return placed


# ------------------------------------------------------------------ the house


def house(seed: int, level: int) -> Blueprint:
    rl = Rules(seed)
    t = rl.type
    bp = Blueprint(W, H, W, name=f"kingscross/house/g{seed}", level=level)

    w, d = rl.w, rl.d
    side_room = 4 if t in ("lhouse", "towerhouse") else 0
    if side_room:
        x0 = 1 + side_room if rl.side == "left" else W - 1 - side_room - w
    else:
        x0 = (W - w) // 2
    z0 = 5 if t == "saltbox" else 1
    body = (x0, z0, x0 + w - 1, z0 + d - 1)
    x0, z0, x1, z1 = body
    door_x = (x0 + x1) // 2 + rl.door_shift

    floors = {1: 1, 2: 2, 3: 2}[level]
    if t == "cottage":
        floors = 1  # cottages grow into the roof (loft + dormers), not upward
    if t == "townhouse" and level == 3:
        floors = 3
    jetty = t == "townhouse" and floors >= 2

    chim = (x0 + 1, z0) if t == "towerhouse" and rl.side == "right" else (x1 - 1, z0)
    lad = (x1 - 1, z0 + 1) if chim != (x1 - 1, z0) else (x0 + 1, z0 + 1)
    lad_wall = (lad[0] + 1, lad[1]) if lad[0] == x1 - 1 else (lad[0] - 1, lad[1])
    win = windows_for(body, floors, door_x, {chim, lad_wall})
    if jetty:
        win = {wnd for wnd in win if not (wnd[1] == z1 and wnd[2] >= 1)}
        win |= {(x, z1 + 1, f) for f in range(1, floors) for x in range(x0 + 1, x1) if (x - x0) % 2 == 1}
    posts = {(door_x - 1, z1), (door_x + 1, z1)} if w >= 9 else set()
    top_y = shell(bp, rl, body, floors, door=(door_x, z1), windows=win, posts=posts, jetty_front=jetty)

    solid = [body]
    tower = None
    if t == "lhouse" and level >= 2:
        wd = min(d, 4)
        wing = (x0 - 4, z1 - wd + 1, x0, z1) if rl.side == "left" else (x1, z1 - wd + 1, x1 + 4, z1)
        sx = wing[2] if rl.side == "left" else wing[0]
        shared = frozenset((sx, z) for z in range(wing[1], wing[3] + 1))
        wwin = {wnd for wnd in windows_for(wing, 1, -10, shared) if (wnd[0], wnd[1]) not in shared}
        wy = shell(bp, rl, wing, 1, windows=wwin, skip=shared)
        bp.set(sx, 1, (wing[1] + wing[3]) // 2, None)
        bp.set(sx, 2, (wing[1] + wing[3]) // 2, None)
        roof(bp, wing, wy, ridge="z" if rl.ridge == "x" else "x", kind="gable", keep=keep_outside(body))
        front_details(bp, rl, wing, -10, wwin)
        solid.append(wing)
    if t == "saltbox" and level >= 2:
        lean = (x0, 1, x1, z0)
        shared = frozenset((x, z0) for x in range(x0, x1 + 1))
        lwin = {wnd for wnd in windows_for(lean, 1, -10, shared) if wnd[1] != z0}
        shell(bp, rl, lean, 1, windows=lwin, skip=shared)
        for x in range(x0 + 2, x1 - 1, 3):
            if (x, z0) != chim:
                bp.set(x, 1, z0, None)
                bp.set(x, 2, z0, None)
        solid.append(lean)
    if t == "towerhouse" and level >= 2:
        tower = (x0 - 3, z0, x0 - 1, z0 + 2) if rl.side == "left" else (x1 + 1, z0, x1 + 3, z0 + 2)
        tfl = 2 if level == 2 else 3
        tx = (tower[0] + tower[2]) // 2
        twin = {(tx, tower[3], f) for f in range(tfl)} | {(tower[0] if rl.side == "left" else tower[2], tower[1] + 1, f) for f in range(tfl)}
        ty = shell(bp, rl, tower, tfl, windows=twin)
        bx = x0 if rl.side == "left" else x1
        bp.set(bx, 1, tower[1] + 1, None)
        bp.set(bx, 2, tower[1] + 1, None)
        for y in range(1, ty):
            bp.set(tx, y, tower[1] + 1, B("ladder", facing_direction=3))
            if bp.get(tx, y, tower[1] + 1) and y % 3 == 1 and y > 1:
                pass
        for fl in range(4, ty, 3):
            bp.set(tx, fl, tower[1] + 1, B("ladder", facing_direction=3))
        ttop = roof(bp, tower, ty, ridge="z", kind="hip")
        if level >= 3:
            fx, fz = tx, (tower[1] + tower[3]) // 2
            for y in range(ttop + 1, ttop + 4):
                bp.set(fx, y, fz, ROLES["fence"])
            bp.set(fx + 1, ttop + 3, fz, ROLES["accent"])
            bp.set(fx + 1, ttop + 2, fz, ROLES["accent"])
            bp.set(fx + 2, ttop + 3, fz, ROLES["accent_light"])
        solid.append(tower)

    # Main roof (over the jetty when there is one), catslide for the saltbox.
    jbox = (x0, z0, x1, z1 + (1 if jetty else 0))
    rtop = roof(bp, jbox, top_y, ridge=rl.ridge, kind=rl.kind, keep=keep_outside(tower))
    if t == "saltbox" and level >= 2:
        catslide(bp, jbox, top_y, rl.ridge, side=-1, length=z0)

    # Cottage loft + shed dormers (levels 2-3).
    if t == "cottage" and level >= 2:
        bp.fill(x0 + 1, top_y, z0 + 1, x1 - 1, top_y, z1 - 1, ROLES["floor"])
        xs = [(x0 + x1) // 2] if w == 7 else [x0 + 2, x1 - 2]
        for cx in xs:
            for x in (cx - 1, cx, cx + 1):
                for y in (top_y + 1, top_y + 2):
                    if x == cx:
                        bp.set(x, y, z1, ROLES["window"] if y == top_y + 1 else ROLES["wall"])
                        bp.set(x, y, z1 - 1, None)
                    else:
                        bp.set(x, y, z1, frame())
                        bp.set(x, y, z1 - 1, ROLES["wall"])
                if bp.get(x, top_y + 1, z1 + 1) is not None:
                    bp.set(x, top_y + 1, z1 + 1, None)
            for x in range(cx - 1, cx + 2):  # shed roof: a lip of stairs, slabs back to the main slope
                bp.set(x, top_y + 3, z1 + 1, st("dark_oak", "north"))
                bp.set(x, top_y + 3, z1, sl("spruce"))
                bp.set(x, top_y + 3, z1 - 1, sl("spruce"))
            bp.set(cx, top_y, z1 + 1, B("azalea_leaves", persistent_bit=True, update_bit=False))

    # Details.
    front_details(bp, rl, body, door_x, win)
    if jetty:
        for f in range(1, floors):
            jetty_brackets(bp, body, 1 + 3 * f + 1)
    elif floors >= 2 and t != "cottage":
        beam_ends(bp, body, 4)
    chimney(bp, rl, chim[0], chim[1], rtop + 1)

    # Ladder to the upper floor or loft.
    top_floor = top_y if t == "cottage" and level >= 2 else (4 + 3 * (floors - 2) if floors >= 2 else 0)
    if top_floor:
        for yy in range(1, top_floor + 1):
            bp.set(lad[0], yy, lad[1], B("ladder", facing_direction=4 if lad_wall[0] > lad[0] else 5))

    # Interior.
    ix0, iz0, ix1, iz1 = x0 + 1, z0 + 1, x1 - 1, z1 - 1
    kx = ix0 if chim[0] != x0 + 1 else ix1
    bp.set(kx, 1, iz0, facing("smoker", "south"))
    bp.set(kx + (1 if kx == ix0 else -1), 1, iz0, B("crafting_table"))
    bp.set(kx + (1 if kx == ix0 else -1), 2, iz0, lantern())
    nbeds = {1: 2, 2: 3, 3: 4}[level]
    free_back = [x for x in range(ix0, ix1 + 1) if bp.get(x, 1, iz0) is None and (x, iz0) != lad and (x, iz0 + 1) != lad]
    if not top_floor:
        beds(bp, free_back[:nbeds], 1, iz0, iz0 + 1)
        bx = ix0 if bp.get(ix0, 1, iz1) is None else ix1
        bp.set(bx, 1, iz1, B("barrel", facing_direction=1, open_bit=False))
        bp.set(bx, 2, iz1, lantern())
    else:
        for i, x in enumerate(free_back[:3]):
            bp.set(x, 1, iz0, facing("chest", "south") if i != 1 else B("barrel", facing_direction=1, open_bit=False))
        corner = (ix0, iz1) if (ix0, iz1) != (door_x, iz1) else (ix1, iz1)
        bp.set(corner[0], 1, corner[1], B("bookshelf"))
        bp.set(corner[0], 2, corner[1], lantern())
        cx, cz = (ix0 + ix1) // 2, min(iz1 - 1, iz0 + 2)
        if (cx, cz) != lad and cz > iz0:
            bp.set(cx, 1, cz, B("spruce_fence"))
            bp.set(cx, 2, cz, sl("spruce"))
            for dx, rise in ((-1, "east"), (1, "west")):
                if bp.get(cx + dx, 1, cz) is None and (cx + dx, cz) != lad:
                    bp.set(cx + dx, 1, cz, st("spruce", rise))
        if t == "cottage":
            zc = (z0 + z1) // 2
            ub = [x for x in range(ix0, ix1 + 1) if (x, zc) != lad and (x, zc + 1) != lad]
            beds(bp, ub[:nbeds], top_y + 1, zc, zc + 1)
        else:
            ub = [x for x in range(ix0, ix1 + 1) if (x, iz0) != lad and (x, iz0 + 1) != lad]
            beds(bp, ub[:nbeds], 5, iz0, iz0 + 1)
            if floors == 3:
                bp.set(ix0, 8, iz1, facing("chest", "east"))
                bp.set(ix0, 9, iz1, lantern()) if False else None
                bp.set(ix0 + 1, 8, iz1, lantern())
        ly = (top_y + 1) if t == "cottage" else 5
        lspot = (ix1, iz1) if (ix1, iz1) != lad else (ix0, iz1)
        if bp.get(lspot[0], ly, lspot[1]) is None:
            bp.set(lspot[0], ly, lspot[1], lantern())
        hz = (iz0 + iz1) // 2 + 1
        if (cx, hz) != lad:
            bp.set(cx, 3, hz, lantern(hanging=True))

    # Street side: banners (level 2+), porch (level 3).
    front_z = z1 + (1 if jetty else 0)
    if level >= 2:
        for dx in (-2, 2):
            bx = door_x + dx
            if x0 < bx < x1 and bp.get(bx, 2, z1 + 1) is None and bp.get(bx, 3, z1 + 1) is None and (bx, z1, 0) not in win:
                banner(bp, bx, 2, z1 + 1)
    if level >= 3:
        if rl.porch == "gable":
            for px in (door_x - 1, door_x + 1):
                bp.set(px, 1, z1 + 2, ROLES["fence"])
                bp.set(px, 2, z1 + 2, ROLES["fence"])
            roof(bp, (door_x - 1, z1 + 1, door_x + 1, z1 + 2), 3, ridge="z", kind="gable", infill=False, rafters=False,
                 gable_window=False, soft=True, keep=lambda x, y, z: z > z1)
            bp.set(door_x, 2, z1 + 2, lantern(hanging=True)) if bp.get(door_x, 3, z1 + 2) else None
            front_z = max(front_z, z1 + 3)
        elif rl.porch == "awning":
            kit.awning(bp, door_x - 1, door_x + 1, 3, z1 + 1)
        else:  # pentice: a slab roof along the front, striped with guild blue
            for x in range(x0, x1 + 1):
                if bp.get(x, 3, z1 + 1) is None:
                    bp.set(x, 3, z1 + 1, sl("dark_oak", top=True) if x % 2 else ROLES["accent"])
        for dx in (-1, 1):
            if bp.get(door_x + dx, 1, z1 + 1) is None:
                bp.set(door_x + dx, 1, z1 + 1, lantern())

    placed = yard(bp, rl, level, solid, door_x, front_z)
    bp.notes = [f"Seed {seed}: {rl.describe()}", f"Yard: {', '.join(placed) or 'plain'}"]
    return bp


def candidates(seeds):
    return {seed: [house(seed, level) for level in (1, 2, 3)] for seed in seeds}
