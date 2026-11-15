"""Preview pictures for blueprint review (step 4 of docs/STRUCTURES.md): three-quarter views of the front and
back, a floor plan with legend, and a sheet comparing the levels. Flat-shaded blocks, good enough to judge
shape, proportions, colours and layout; the in-game preview command shows the real thing."""
from __future__ import annotations

from PIL import Image, ImageDraw, ImageFont

from bfstruct import Blueprint

COLORS = [  # first match wins
    ("stone_brick", (140, 140, 140)), ("leaves", (60, 120, 50)), ("calcite", (226, 224, 216)), ("brick_block", (150, 75, 60)), ("brick_stairs", (150, 75, 60)), ("smoker", (90, 85, 80)),
    ("white_wool", (235, 235, 235)), ("spruce_fence", (110, 80, 48)), ("spruce_trapdoor", (110, 80, 48)),
    ("water", (64, 110, 220)), ("glass_pane", (190, 225, 240)), ("glass", (200, 230, 245)),
    ("dark_oak", (66, 43, 21)), ("spruce", (110, 80, 48)), ("stripped_oak", (178, 145, 88)), ("oak_log", (110, 86, 52)),
    ("oak", (182, 146, 92)), ("wooden_door", (150, 115, 70)), ("birch", (215, 200, 150)),
    ("cobblestone", (122, 122, 122)), ("mossy", (100, 120, 90)), ("stone_brick", (140, 140, 140)), ("smooth_stone", (165, 165, 165)),
    ("stone", (130, 130, 130)), ("bricks", (150, 75, 60)),
    ("blue_wool", (50, 70, 170)), ("blue_carpet", (50, 70, 170)), ("blue", (55, 80, 180)), ("white", (230, 230, 230)),
    ("grass_path", (150, 120, 70)), ("dirt_path", (150, 120, 70)), ("farmland", (95, 60, 35)), ("dirt", (120, 85, 55)),
    ("grass_block", (95, 155, 65)), ("hay", (200, 170, 50)), ("wheat", (210, 190, 80)), ("carrots", (230, 130, 40)), ("beetroot", (150, 40, 60)), ("potatoes", (180, 160, 70)),
    ("leaves", (60, 120, 50)), ("azalea", (80, 140, 60)), ("cornflower", (80, 110, 230)), ("poppy", (210, 40, 40)), ("dandelion", (240, 220, 50)),
    ("oxeye", (240, 240, 230)), ("allium", (180, 100, 220)), ("flower_pot", (150, 80, 60)),
    ("lantern", (255, 200, 90)), ("torch", (255, 210, 100)), ("campfire", (230, 120, 40)),
    ("bed", (180, 40, 40)), ("chest", (170, 120, 50)), ("barrel", (140, 100, 60)), ("furnace", (95, 95, 95)), ("crafting", (160, 110, 60)),
    ("composter", (120, 90, 50)), ("lectern", (170, 130, 80)), ("bookshelf", (140, 100, 60)), ("fence", (170, 135, 85)), ("trapdoor", (165, 130, 80)),
]
THIN = ("fence", "pane", "lantern", "torch", "door", "wheat", "carrots", "potatoes", "cornflower", "poppy", "dandelion", "oxeye", "allium", "flower_pot", "campfire")
HALF = ("slab", "carpet", "bed", "trapdoor")


def color(bid: str):
    for key, c in COLORS:
        if key in bid:
            return c
    return (200, 0, 200)  # magenta = unknown block, easy to spot


def shade(c, f):
    return tuple(max(0, min(255, int(v * f))) for v in c)


WEIRDO_VEC = {0: (1, 0), 1: (-1, 0), 2: (0, 1), 3: (0, -1)}


def rotated(bp: Blueprint, turns: int):
    """Grid seen from a different side (for the back view), with the stairs' rising side turned along."""
    out = {}
    for (x, y, z), b in bp.grid.items():
        rise = WEIRDO_VEC.get(b.state("weirdo_direction")) if "stairs" in b.id else None
        for _ in range(turns % 4):
            x, z = bp.d - 1 - z, x
            if rise:
                rise = (-rise[1], rise[0])
        out[(x, y, z)] = (b, rise)
    return out


def iso(bp: Blueprint, turns=0, tile=22) -> Image.Image:
    grid = rotated(bp, turns)
    w = max(bp.w, bp.d)
    hw, hq, hh = tile // 2, tile // 4, tile // 2  # half width, quarter (top depth), cube height
    W = (2 * w + 2) * hw
    H = (2 * w) * hq + (bp.height_used() + 2) * hh + tile
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    ox, oy = W // 2, (bp.height_used() + 1) * hh

    def pt(x, y, z):
        return (ox + (x - z) * hw, oy + (x + z) * hq - y * hh)

    def box(x0, x1, y0, y1, z0, z1, c):
        # faces: top, south (+z, left), east (+x, right)
        d.polygon([pt(x0, y1, z0), pt(x1, y1, z0), pt(x1, y1, z1), pt(x0, y1, z1)], fill=shade(c, 1.1))
        d.polygon([pt(x0, y0, z1), pt(x1, y0, z1), pt(x1, y1, z1), pt(x0, y1, z1)], fill=shade(c, 0.85))
        d.polygon([pt(x1, y0, z0), pt(x1, y0, z1), pt(x1, y1, z1), pt(x1, y1, z0)], fill=shade(c, 0.7))

    for (x, y, z) in sorted(grid, key=lambda p: (p[0] + p[2], p[1], p[0])):
        b, rise = grid[(x, y, z)]
        c = color(b.id)
        if rise:  # stairs: a half-height step plus a raised back half on the rising side
            up = b.state("upside_down_bit")
            box(x, x + 1, y + (0.5 if up else 0), y + (1 if up else 0.5), z, z + 1, c)
            bx0, bx1 = (x + 0.5, x + 1) if rise[0] > 0 else (x, x + 0.5) if rise[0] < 0 else (x, x + 1)
            bz0, bz1 = (z + 0.5, z + 1) if rise[1] > 0 else (z, z + 0.5) if rise[1] < 0 else (z, z + 1)
            box(bx0, bx1, y + (0 if up else 0.5), y + (0.5 if up else 1), bz0, bz1, c)
            continue
        x0, x1, z0, z1, top = x, x + 1, z, z + 1, y + 1
        if any(t in b.id for t in THIN):
            x0, x1, z0, z1 = x + 0.35, x + 0.65, z + 0.35, z + 0.65
            if "pane" in b.id or "door" in b.id:
                x0, x1, z0, z1 = x + 0.4, x + 0.6, z, z + 1
        if any(t in b.id for t in HALF) and not b.state("minecraft:vertical_half") == "top":
            top = y + 0.5
        bottom = y + 0.5 if b.state("minecraft:vertical_half") == "top" else y
        box(x0, x1, bottom, top, z0, z1, c)
    return img.crop(img.getbbox() or (0, 0, 1, 1))


def font(size):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def floor_plan(bp: Blueprint, y: int, cell=26) -> Image.Image:
    """Top-down plan at height y (falls back to the block below, so floors and yards show)."""
    pad = 22
    img = Image.new("RGB", (bp.w * cell + 2 * pad, bp.d * cell + 2 * pad), (245, 238, 220))
    d = ImageDraw.Draw(img)
    f = font(11)
    for z in range(bp.d):
        for x in range(bp.w):
            b = bp.get(x, y, z) or bp.get(x, y - 1, z)
            c = color(b.id) if b else (95, 155, 65)
            x0, y0 = pad + x * cell, pad + z * cell
            d.rectangle([x0, y0, x0 + cell - 1, y0 + cell - 1], fill=c, outline=(80, 70, 60))
    for x in range(bp.w):
        d.text((pad + x * cell + cell // 2 - 3, pad + bp.d * cell + 4), str(x + 1), fill=(60, 50, 40), font=f)
    for z in range(bp.d):
        d.text((4, pad + z * cell + cell // 2 - 6), str(bp.d - z), fill=(60, 50, 40), font=f)
    d.text((pad, 4), "N (back)", fill=(60, 50, 40), font=f)
    d.text((pad, pad + bp.d * cell + 16), "S (street, entrance)", fill=(60, 50, 40), font=f)
    return img


def legend(bp: Blueprint) -> Image.Image:
    ids = sorted({b.id.replace("minecraft:", "") for b in bp.grid.values()})
    f = font(13)
    img = Image.new("RGB", (260, 20 + 20 * len(ids)), (245, 238, 220))
    d = ImageDraw.Draw(img)
    for i, bid in enumerate(ids):
        d.rectangle([10, 10 + i * 20, 24, 24 + i * 20], fill=color(bid), outline=(60, 50, 40))
        d.text((32, 10 + i * 20), bid, fill=(40, 30, 20), font=f)
    return img


def sheet(bp: Blueprint, title: str, notes: list[str], path: str):
    """One review sheet per level: front view, back view, ground-floor plan, legend and notes."""
    front, back = iso(bp, 0, tile=44), iso(bp, 2, tile=44)
    plan = floor_plan(bp, 1)
    leg = legend(bp)
    f, fb = font(15), font(26)
    W = max(front.width + back.width + 60, plan.width + leg.width + 620)
    H = 60 + max(front.height, back.height) + 40 + max(plan.height, leg.height, 40 + 20 * len(notes)) + 30
    img = Image.new("RGB", (W, H), (120, 165, 210))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 48], fill=(40, 60, 120))
    d.text((16, 10), title, fill=(255, 255, 255), font=fb)
    img.paste(front, (20, 60), front)
    img.paste(back, (40 + front.width, 60), back)
    d.text((20, 60 + front.height + 6), "Front (street side)", fill=(20, 20, 40), font=f)
    d.text((40 + front.width, 60 + back.height + 6), "Back", fill=(20, 20, 40), font=f)
    y2 = 60 + max(front.height, back.height) + 40
    img.paste(plan, (20, y2))
    img.paste(leg, (40 + plan.width, y2))
    nx = 60 + plan.width + leg.width
    d.rectangle([nx - 10, y2, W - 10, y2 + 30 + 20 * len(notes)], fill=(245, 238, 220))
    for i, line in enumerate([f"Size {bp.w} x {bp.d}, height {bp.height_used()}"] + notes):
        d.text((nx, y2 + 8 + i * 20), line, fill=(40, 30, 20), font=f)
    img.save(path)


def level_strip(bps: list[Blueprint], title: str, path: str):
    views = [iso(bp, 0, tile=34) for bp in bps]
    f, fb = font(16), font(24)
    W = sum(v.width for v in views) + 40 * (len(views) + 1)
    H = 60 + max(v.height for v in views) + 40
    img = Image.new("RGB", (W, H), (120, 165, 210))
    d = ImageDraw.Draw(img)
    d.text((16, 12), title, fill=(20, 30, 60), font=fb)
    x = 40
    for bp, v in zip(bps, views):
        img.paste(v, (x, 56 + max(vv.height for vv in views) - v.height), v)
        d.text((x, H - 32), f"Level {bp.level} (height {bp.height_used()})", fill=(20, 30, 60), font=f)
        x += v.width + 40
    img.save(path)
