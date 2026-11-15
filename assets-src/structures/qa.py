"""Automatic QA for blueprints (step 4 of docs/STRUCTURES.md). Errors stop the build; warnings are reported."""
from __future__ import annotations

from bfstruct import Blueprint

SOLID_HINTS = ("planks", "log", "bricks", "cobblestone", "stone", "wool", "concrete", "terracotta", "glass", "_wood")
LIGHTS = ("lantern", "torch", "campfire", "glowstone", "shroomlight", "sea_lantern")
SUPPORT_FREE = ("lantern",)  # hanging lanterns hang from above


def is_solid(b) -> bool:
    return b is not None and any(h in b.id for h in SOLID_HINTS) and "pane" not in b.id


def check(bp: Blueprint, plot_w: int, max_height: int, allowed: set[str] | None, needs: dict[str, int]) -> tuple[list, list]:
    errors, warnings = [], []
    tag = f"{bp.name} L{bp.level}"
    if bp.w != plot_w or bp.d != plot_w:
        errors.append(f"{tag}: lot is {bp.w}x{bp.d}, plot is {plot_w}x{plot_w}")
    if bp.height_used() > max_height:
        errors.append(f"{tag}: height {bp.height_used()} is over the limit {max_height}")

    # Entrance: a door on the street-facing half, reachable from the front edge.
    doors = [(x, y, z) for (x, y, z), b in bp.grid.items() if b.id.endswith("door") and "trapdoor" not in b.id and not b.state("upper_block_bit")]
    if not doors:
        errors.append(f"{tag}: no door")

    # Palette: only blocks the faction style guide allows.
    if allowed is not None:
        bad = sorted({b.id for b in bp.grid.values() if b.id not in allowed})
        if bad:
            errors.append(f"{tag}: blocks outside the style palette: {', '.join(bad)}")

    # Required contents (beds, workstations...).
    for bid, count in needs.items():
        n = sum(1 for b in bp.grid.values() if b.id == f"minecraft:{bid}" and not b.state("head_piece_bit", False) and not b.state("upper_block_bit", False))
        if n < count:
            errors.append(f"{tag}: needs {count}x {bid}, has {n}")

    # Floating: every block must connect down to the ground (y 0) through other blocks.
    grounded = set()
    frontier = [p for p in bp.grid if p[1] <= 1]
    grounded.update(frontier)
    while frontier:
        x, y, z = frontier.pop()
        for dx, dy, dz in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)):
            n = (x + dx, y + dy, z + dz)
            if n in bp.grid and n not in grounded:
                grounded.add(n)
                frontier.append(n)
    floating = [p for p in bp.grid if p not in grounded]
    if floating:
        errors.append(f"{tag}: {len(floating)} floating block(s), e.g. {floating[:3]}")

    # Headroom: two clear blocks above each door's floor inside.
    for (x, y, z) in doors:
        if bp.get(x, y + 1, z) is None:
            errors.append(f"{tag}: door at {(x, y, z)} has no upper half")

    # Light: every indoor floor spot within 6 blocks of a light, so mobs can't spawn inside.
    lights = [p for p, b in bp.grid.items() if any(l in b.id for l in LIGHTS)]
    dark = 0
    for (x, y, z), b in bp.grid.items():
        if "planks" in b.id and y >= 0 and bp.get(x, y + 1, z) is None and bp.get(x, y + 2, z) is None and roofed(bp, x, y, z):
            if not any(abs(lx - x) + abs(ly - y) + abs(lz - z) <= 6 for (lx, ly, lz) in lights):
                dark += 1
    if dark:
        warnings.append(f"{tag}: {dark} indoor floor spot(s) farther than 6 blocks from a light")

    # Farmland must have water within 4 blocks, or the crops pop off.
    for (x, y, z), b in bp.grid.items():
        if b.id == "minecraft:farmland":
            near = any(bb.id == "minecraft:water" and abs(px - x) <= 4 and abs(pz - z) <= 4 and abs(py - y) <= 1 for (px, py, pz), bb in bp.grid.items())
            if not near:
                errors.append(f"{tag}: farmland at {(x, y, z)} has no water within 4 blocks")
                break
    return errors, warnings


def roofed(bp: Blueprint, x, y, z) -> bool:
    return any(is_solid(bp.get(x, yy, z)) or (bp.get(x, yy, z) and "stairs" in bp.get(x, yy, z).id) for yy in range(y + 3, bp.h))
