"""Kingscross Guild house GENERATOR (docs/STRUCTURES.md, "design generator + gallery").

A seed picks a combination of design rules; the same seed always gives the same house, with three levels.
Owner, 2026-11-15: the machine makes many candidates, the owner approves or rejects them from a gallery.
Faction DNA (always): stone base, dark timber frame with light plaster, dark roof with stone trim, brick or
cobblestone chimney, guild banners, blue-and-white awnings, tidy fenced yard with real crops.
Biome rules (roof shape, walls, windows) come later as separate rule sets; this file is the plains style.

Lot: 13 x 13, authored facing south (z = 12 is the street).
"""
from __future__ import annotations

import random

from bfstruct import B, Blueprint, bed_pair, facing, lantern, log
from kingscross import kit
from kingscross.palette import ROLES, frame, trim

W = 13
H = 18
BANNER = "bannerforge_settlements:banner_blue"


class Rules:
    """The design choices for one seed (shared by all three levels)."""

    def __init__(self, seed: int):
        r = random.Random(seed * 7919 + 13)
        self.seed = seed
        self.body_w = r.choice([7, 7, 9])
        self.body_d = r.choice([5, 6, 7])
        self.place = r.choice(["back_center", "back_left", "back_right", "front_left", "front_right"])
        self.ridge = r.choice(["z", "x"])
        self.wing = r.random() < 0.55
        self.wing_side = r.choice(["left", "right"])
        self.wing_w = r.choice([3, 4])
        self.wing_d = r.choice([3, 4, 5])
        self.jetty = r.random() < 0.5
        self.chimney_at = r.choice(["back", "gable"])
        self.chimney_block = r.choice(["brick", "brick", "cobble"])
        self.porch = r.choice(["awning", "posts", "posts"])
        self.window_boxes = r.random() < 0.7
        self.moss = r.choice([0.0, 0.1, 0.2])
        self.yard_pref = r.sample(["crops", "well", "woodpile", "hay", "flowers", "bench"], 6)
        self.fence = r.choice(["fence", "fence", "hedge"])
        self.rng = r

    def describe(self):
        bits = [f"{self.body_w}x{self.body_d}", self.place.replace("_", " "), "gable to street" if self.ridge == "z" else "eaves to street"]
        if self.wing:
            bits.append(f"{self.wing_side} wing")
        if self.jetty:
            bits.append("jettied upper floor")
        bits.append(f"{self.chimney_block} chimney")
        bits.append(self.porch if self.porch != "posts" else "porch on posts")
        return ", ".join(bits)


# ------------------------------------------------------------------ geometry of the body and wing


def body_rect(rl: Rules):
    w, d = rl.body_w, rl.body_d
    room_for_wing = rl.wing_w if rl.wing else 0
    if rl.place.startswith("back"):
        z0 = 1
    else:
        z0 = 12 - 3 - d  # leave a 2-row front strip for the path and flowers
    if rl.place.endswith("center"):
        x0 = (W - w) // 2
    elif rl.place.endswith("left"):
        x0 = 1
    else:
        x0 = W - 1 - w
    # Make room for the wing inside the lot.
    if rl.wing:
        if rl.wing_side == "left" and x0 - room_for_wing < 1:
            x0 = 1 + room_for_wing
        if rl.wing_side == "right" and x0 + w - 1 + room_for_wing > W - 2:
            x0 = W - 2 - room_for_wing - (w - 1)
    return x0, z0, x0 + w - 1, z0 + d - 1


def wing_rect(rl: Rules, body):
    x0, z0, x1, z1 = body
    d = min(rl.wing_d, z1 - z0 + 1)
    wz0 = z1 - d + 1  # flush with the body's front
    if rl.wing_side == "left":
        return x0 - rl.wing_w, wz0, x0, z1  # shares the body's side wall
    return x1, wz0, x1 + rl.wing_w, z1


# ------------------------------------------------------------------ building parts


def stone(rl: Rules, block):
    """Base stone with a little moss, seeded so every level looks the same."""
    return B("mossy_cobblestone") if rl.rng.random() < rl.moss and block.id.endswith("cobblestone") else block


def walls_band(bp, rect, y0, y1, posts, windows, skip=()):
    x0, z0, x1, z1 = rect
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            for z in range(z0, z1 + 1):
                if not (x in (x0, x1) or z in (z0, z1)) or (x, z) in skip:
                    continue
                if (x in (x0, x1) and z in (z0, z1)) or (x, z) in posts:
                    bp.set(x, y, z, frame())
                elif (x, z) in windows and y == y0:
                    bp.set(x, y, z, ROLES["window"])
                else:
                    bp.set(x, y, z, ROLES["wall"])


def ground_floor(bp, rl, rect, skip=()):
    x0, z0, x1, z1 = rect
    for x in range(x0, x1 + 1):
        for z in range(z0, z1 + 1):
            edge = x in (x0, x1) or z in (z0, z1)
            if (x, z) in skip:
                continue
            bp.set(x, 0, z, stone(rl, ROLES["foundation"]) if edge else ROLES["floor"])
            if edge:
                corner = x in (x0, x1) and z in (z0, z1)
                bp.set(x, 1, z, ROLES["corner_stone"] if corner else stone(rl, ROLES["lower_wall"]))


def front_windows(x0, x1, z, door_x):
    out = set()
    for x in range(x0 + 1, x1):
        if abs(x - door_x) >= 2 and (x - x0) % 2 == 1:
            out.add((x, z))
    return out


def side_windows(x, z0, z1, avoid=()):
    out = set()
    for z in range(z0 + 1, z1):
        if (z - z0) % 2 == 0 and (x, z) not in avoid:
            out.add((x, z))
    return out


def chimney(bp, rl, x, z, top):
    block = ROLES["chimney"] if rl.chimney_block == "brick" else ROLES["foundation_alt"]
    for y in range(1, top + 1):
        bp.set(x, y, z, block)
    bp.set(x, top + 1, z, facing("campfire", "south", extinguished=False))


def banner(bp, x, y, z, toward="south"):
    """Faction banner (two blocks) hanging on the wall behind (x, y..y+1, z)."""
    bp.set(x, y, z, B(BANNER, **{"bannerforge_settlements:part": "bottom", "minecraft:cardinal_direction": toward}))
    bp.set(x, y + 1, z, B(BANNER, **{"bannerforge_settlements:part": "top", "minecraft:cardinal_direction": toward}))


def beds(bp, cells, y):
    for (x, zh, zf) in cells:
        foot, head = bed_pair("north" if zh < zf else "south")
        bp.set(x, y, zf, foot)
        bp.set(x, y, zh, head)


# ------------------------------------------------------------------ yard


def yard(bp, rl: Rules, level, houses, door_x, front_z):
    """Fence, gate and path, then yard features placed where they fit."""
    blocked = set()
    for (x0, z0, x1, z1) in houses:
        for x in range(x0 - 1, x1 + 2):
            for z in range(z0 - 1, z1 + 2):
                blocked.add((x, z))
    # Path from the door to the gate.
    for z in range(front_z + 1, W):
        bp.set(door_x, 0, z, ROLES["path"])
        blocked.add((door_x, z))
        blocked.add((door_x - 1, z))
        blocked.add((door_x + 1, z))
    # Fence on the lot edge, never against a wall; lantern posts at the front corners; flag at level 3.
    for x in range(W):
        for z in range(W):
            if not (x in (0, W - 1) or z in (0, W - 1)):
                continue
            if (x, z) in blocked and (x, z) != (door_x, W - 1):
                if any(x0 - 1 <= x <= x1 + 1 and z0 - 1 <= z <= z1 + 1 for (x0, z0, x1, z1) in houses):
                    continue
            if (x, z) in ((0, W - 1), (W - 1, W - 1)):
                continue
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
    edge = {(x, z) for x in range(W) for z in range(W) if x in (0, W - 1) or z in (0, W - 1)}
    blocked |= edge

    def fits(x, z, w, d):
        return all(0 <= x + i < W and 0 <= z + j < W and (x + i, z + j) not in blocked for i in range(w) for j in range(d))

    def take(x, z, w, d):
        for i in range(-1, w + 1):
            for j in range(-1, d + 1):
                blocked.add((x + i, z + j))

    def find(w, d):
        spots = [(x, z) for z in range(W - 1, -1, -1) for x in range(W) if fits(x, z, w, d)]
        return spots[0] if spots else None

    feats = rl.yard_pref if level >= 2 else [f for f in rl.yard_pref if f in ("crops", "flowers", "hay")]
    if "crops" not in feats[:3]:
        feats = ["crops"] + [f for f in feats if f != "crops"]  # every house grows something (real crops)
    placed = []
    for feat in feats:
        if feat == "crops":
            for (w, d) in ((5, 3), (3, 5), (3, 3)):
                spot = find(w, d)
                if spot:
                    x, z = spot
                    cells = [(x + i, z + j) for i in range(w) for j in range(d) if (i, j) != (w // 2, d // 2)]
                    kit.crops(bp, cells, water=(x + w // 2, z + d // 2), kinds=("wheat", "carrots", "potatoes", "beetroot"))
                    take(x, z, w, d)
                    placed.append("crops")
                    break
        elif feat == "well" and level >= 3:
            spot = find(3, 3)
            if spot:
                x, z = spot
                bp.ring(x, z, x + 2, z + 2, 0, B("cobblestone"))
                bp.ring(x, z, x + 2, z + 2, 1, B("cobblestone"))
                bp.set(x + 1, 0, z + 1, B("water"))
                bp.set(x + 1, 1, z + 1, None)
                for (px, pz) in ((x, z), (x + 2, z + 2)):
                    bp.set(px, 2, pz, ROLES["fence"])
                    bp.set(px, 3, pz, ROLES["fence"])
                for i in range(3):
                    for j in range(3):
                        bp.set(x + i, 4, z + j, B("spruce_slab", **{"minecraft:vertical_half": "bottom"}))
                take(x, z, 3, 3)
                placed.append("well")
        elif feat == "woodpile":
            spot = find(3, 1)
            if spot:
                x, z = spot
                for i in range(3):
                    bp.set(x + i, 1, z, B("spruce_log", pillar_axis="z"))
                bp.set(x + 1, 2, z, B("spruce_log", pillar_axis="z"))
                take(x, z, 3, 1)
                placed.append("woodpile")
        elif feat == "hay":
            spot = find(2, 2)
            if spot:
                x, z = spot
                bp.set(x, 1, z, B("hay_block", pillar_axis="y"))
                bp.set(x + 1, 1, z, B("hay_block", pillar_axis="x"))
                bp.set(x, 2, z, B("hay_block", pillar_axis="y"))
                bp.set(x, 1, z + 1, B("barrel", facing_direction=1, open_bit=False))
                bp.set(x + 1, 1, z + 1, B("composter"))
                take(x, z, 2, 2)
                placed.append("hay")
        elif feat == "flowers":
            spot = find(3, 1) or find(1, 3)
            if spot:
                x, z = spot
                kinds = ["cornflower", "poppy", "dandelion", "oxeye_daisy", "cornflower", "allium"]
                for i in range(3):
                    if fits(x + i, z, 1, 1):
                        bp.set(x + i, 1, z, B(kinds[(rl.seed + i) % len(kinds)]))
                    elif fits(x, z + i, 1, 1):
                        bp.set(x, 1, z + i, B(kinds[(rl.seed + i) % len(kinds)]))
                take(x, z, 3, 1)
                placed.append("flowers")
        elif feat == "bench" and level >= 2:
            spot = find(2, 1)
            if spot:
                x, z = spot
                for i in range(2):
                    bp.set(x + i, 1, z, B("spruce_stairs", weirdo_direction=3, upside_down_bit=False))
                take(x, z, 2, 1)
                placed.append("bench")
    return placed


# ------------------------------------------------------------------ the house


def house(seed: int, level: int) -> Blueprint:
    rl = Rules(seed)
    bp = Blueprint(W, H, W, name=f"kingscross/house/g{seed}", level=level)
    body = body_rect(rl)
    x0, z0, x1, z1 = body
    door_x = (x0 + x1) // 2
    has_wing = rl.wing and level >= 2
    wing = wing_rect(rl, body) if has_wing else None
    houses = [body] + ([wing] if wing else [])

    # Ground floor of body (and wing).
    ground_floor(bp, rl, body)
    if wing:
        shared = {(body[0] if rl.wing_side == "left" else body[2], z) for z in range(wing[1], wing[3] + 1)}
        ground_floor(bp, rl, wing, skip=shared)
    posts = {(door_x - 1, z1), (door_x + 1, z1)} if rl.body_w >= 9 else set()
    chimney_xz = (x1 - 1, z0) if rl.chimney_at == "back" else ((x0, (z0 + z1) // 2) if rl.ridge == "z" else (x0, z0 + 1))
    ladder_wall = (x1, z0 + 1)
    win = front_windows(x0, x1, z1, door_x) | side_windows(x0, z0, z1, {chimney_xz}) | side_windows(x1, z0, z1, {ladder_wall}) | {((x0 + x1) // 2 - 1, z0), ((x0 + x1) // 2 + 1, z0)}
    win -= {chimney_xz, ladder_wall}
    if wing:
        win -= {(body[0] if rl.wing_side == "left" else body[2], z) for z in range(wing[1], wing[3] + 1)}
    walls_band(bp, body, 2, 3, posts, win)
    for (x, z) in posts:
        bp.set(x, 1, z, frame())
    kit.door(bp, door_x, 1, z1)
    kit.beam_ring(bp, *body, 4)

    if wing:
        wx0, wz0, wx1, wz1 = wing
        wwin = side_windows(wx0 if rl.wing_side == "left" else wx1, wz0, wz1) | front_windows(wx0, wx1, wz1, -10)
        shared_wall = {(body[0] if rl.wing_side == "left" else body[2], z) for z in range(wz0, wz1 + 1)}
        walls_band(bp, wing, 2, 3, set(), wwin, skip=shared_wall)
        for z in range(wz0 + 1, wz1):  # doorway between body and wing
            if z == (wz0 + wz1) // 2:
                sx = body[0] if rl.wing_side == "left" else body[2]
                bp.set(sx, 1, z, None)
                bp.set(sx, 2, z, None)
        kit.beam_ring(bp, *wing, 4)
        # The wing roof is drawn on its own and only the part outside the main house is kept.
        tmp = Blueprint(W, H, W)
        kit.gable_roof(tmp, wx0, wz0, wx1, wz1, 4, ridge="z" if rl.ridge == "x" else "x", gable_window=False)
        bx0, bz0, bx1, bz1 = body[0], body[1], body[2], body[3] + (1 if rl.jetty else 0)
        for (x, y, z), b in tmp.grid.items():
            if not (bx0 <= x <= bx1 and bz0 <= z <= bz1):
                bp.set(x, y, z, b)

    # Upper floor (levels 2-3), optionally jettied one block over the street side.
    roof_y = 4
    upper = body
    if level >= 2:
        jz1 = z1 + 1 if rl.jetty else z1
        upper = (x0, z0, x1, jz1)
        bp.fill(x0 + 1, 4, z0 + 1, x1 - 1, 4, jz1 - 1, ROLES["floor"])
        if rl.jetty:  # jetty floor and brackets under the overhang
            for x in range(x0, x1 + 1):
                bp.set(x, 4, jz1, frame("x"))
                if x in (x0, x1, door_x - 2, door_x + 2):
                    bp.set(x, 3, jz1, B("dark_oak_stairs", weirdo_direction=3, upside_down_bit=True))
            for x in range(x0 + 1, x1):
                bp.set(x, 4, z1, ROLES["floor"])
        uwin = front_windows(x0, x1, jz1, door_x - 10) | side_windows(x0, z0, jz1, {chimney_xz}) | side_windows(x1, z0, jz1, {ladder_wall})
        uwin |= {((x0 + x1) // 2, z0)}
        uwin -= {chimney_xz, ladder_wall}
        walls_band(bp, upper, 5, 6, {(door_x, jz1)}, uwin)
        kit.beam_ring(bp, *upper, 7)
        roof_y = 7
        bp.set(ladder_wall[0] - 1, 4, ladder_wall[1], None)
        for y in range(1, 5):
            bp.set(ladder_wall[0] - 1, y, ladder_wall[1], B("ladder", facing_direction=4))
    top = kit.gable_roof(bp, upper[0], upper[1], upper[2], upper[3], roof_y, ridge=rl.ridge)
    chimney(bp, rl, chimney_xz[0], chimney_xz[1], min(H - 2, top + 1))

    # Interior.
    ix0, iz0, ix1, iz1 = x0 + 1, z0 + 1, x1 - 1, z1 - 1
    lad = (ladder_wall[0] - 1, ladder_wall[1])
    kitchen = [(ix0, iz0), (ix0 + 1, iz0)]
    bp.set(*xy(kitchen[0], 1), facing("smoker", "south"))
    bp.set(*xy(kitchen[1], 1), B("crafting_table"))
    bp.set(*xy(kitchen[1], 2), lantern())
    store = [(x, iz0) for x in range(ix0 + 2, ix1 + 1) if (x, iz0) != lad]
    if level == 1:
        bed_cells = [(x, iz0, iz0 + 1) for x in range(ix1, ix0 + 1, -1) if (x, iz0) != lad][:2]
        beds(bp, bed_cells, 1)
        used = {(x, iz0) for (x, _, _) in bed_cells} | {(x, iz0 + 1) for (x, _, _) in bed_cells}
        free = [c for c in store if c not in used]
        if free:
            bp.set(*xy(free[0], 1), facing("chest", "south"))
        bp.set(ix0, 1, iz1, B("barrel", facing_direction=1, open_bit=False))
        bp.set(ix0, 2, iz1, lantern())
    else:
        for i, c in enumerate(store[:3]):
            bp.set(*xy(c, 1), facing("chest", "south") if i != 1 else B("barrel", facing_direction=1, open_bit=False))
        bp.set(ix0, 1, iz1, B("bookshelf"))
        bp.set(ix0, 2, iz1, lantern())
        cx, cz = (ix0 + ix1) // 2, (iz0 + iz1) // 2 + 1
        if cz < iz1:
            bp.set(cx, 1, cz, B("spruce_fence"))
            bp.set(cx, 2, cz, B("spruce_slab", **{"minecraft:vertical_half": "bottom"}))
            bp.set(cx, 0, cz, ROLES["floor"])
            for dx in (-1, 1):
                if bp.get(cx + dx, 1, cz) is None and (cx + dx, cz) != (door_x, iz1):
                    bp.set(cx + dx, 1, cz, B("spruce_stairs", weirdo_direction=0 if dx < 0 else 1, upside_down_bit=False))
        bp.set(cx, 3, (iz0 + iz1) // 2, lantern(hanging=True))
        if level >= 3:
            for x in range(cx - 1, cx + 2):
                if bp.get(x, 1, iz1 - 0) is None and x != door_x:
                    pass
            bp.set(door_x, 1, iz1, None)
        # Upstairs: beds along the back wall, a chest, lanterns.
        n = 3 if level == 2 else 4
        ux = [x for x in range(ix0, ix1 + 1) if (x, iz0) != lad][:n]
        if len(ux) < n and wing:
            ux = ux  # the wing takes the rest (below)
        beds(bp, [(x, iz0, iz0 + 1) for x in ux], 5)
        bp.set(ix0, 5, upper[3] - 1, lantern())
        bp.set(ix1, 5, upper[3] - 1, facing("chest", "west"))
        if wing and len(ux) < n:
            wx0, wz0, wx1, wz1 = wing
            bx = wx0 + 1 if rl.wing_side == "left" else wx1 - 1
            beds(bp, [(bx, wz0 + 1, wz0 + 2)], 1)
        if wing:
            wx0, wz0, wx1, wz1 = wing
            lx = wx0 + 1 if rl.wing_side == "left" else wx1 - 1
            bp.set(lx, 1, wz1 - 1, B("barrel", facing_direction=1, open_bit=False))
            bp.set(lx, 2, wz1 - 1, lantern())

    # Street-side details.
    front_z = upper[3] if level >= 2 else z1
    if level >= 2:
        for dx in (-2, 2):
            bx = door_x + dx
            if x0 < bx < x1 and (bx, z1) not in win:
                banner(bp, bx, 2, z1 + 1)
        if rl.window_boxes:
            for (x, z) in win:
                if z == z1 and bp.get(x, 1, z + 1) is None:
                    bp.set(x, 1, z + 1, B("azalea_leaves", persistent_bit=True, update_bit=False))
    if level >= 3:
        if rl.porch == "awning":
            kit.awning(bp, door_x - 1, door_x + 1, 3, z1 + 1)
        else:
            pz = z1 + 2 if not rl.jetty else z1 + 2
            for px in (door_x - 1, door_x + 1):
                bp.set(px, 1, pz, ROLES["fence"])
                bp.set(px, 2, pz, ROLES["fence"])
            for x in range(door_x - 1, door_x + 2):
                for z in range(z1 + 1, pz + 1):
                    bp.set(x, 3, z, B("spruce_slab", **{"minecraft:vertical_half": "bottom"}) if (x + z) % 2 else ROLES["accent"])
            bp.set(door_x, 2, pz, lantern(hanging=True))
        banner(bp, door_x, 5, upper[3] + 1) if rl.ridge == "z" and level >= 3 and not rl.jetty else None

    placed = yard(bp, rl, level, houses, door_x, max(front_z, z1 + (2 if level >= 3 and rl.porch == "posts" else 0)))
    bp.notes = [f"Seed {seed}: {rl.describe()}", f"Yard: {', '.join(placed) or 'plain'}"]
    return bp


def xy(c, y):
    return (c[0], y, c[1])


def candidates(seeds):
    return {seed: [house(seed, level) for level in (1, 2, 3)] for seed in seeds}
