"""BannerForge structure toolkit (docs/STRUCTURES.md).

A Blueprint is a grid of blocks for ONE level of ONE building variant, covering the whole plot (lot): the
building, its yard, garden and fencing. Coordinates are plot-local and always authored facing SOUTH:
  x 0..w-1  left to right as seen from the street (west -> east)
  z 0..d-1  back to front (z = d-1 is the street side, where the entrance is)
  y 0       ground level of the plot (the yard surface); y 1 is the first block above the ground
The game rotates blueprints (and their block states) when the player turns the plot.

Usage from a building script:
    from bfstruct import Blueprint, B, stairs, log, door, ...
    bp = Blueprint(9, 12, 9); bp.set(x, y, z, B("oak_planks")); ...
    export([...blueprints...]) is called by build_all.py
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field

# ---------------------------------------------------------------- blocks


@dataclass(frozen=True)
class Block:
    id: str
    states: tuple = ()  # sorted (name, value) pairs, hashable

    def state(self, name, default=None):
        return dict(self.states).get(name, default)

    def to_json(self):
        d = {"id": self.id}
        if self.states:
            d["states"] = dict(self.states)
        return d


def B(name: str, **states) -> Block:
    """B("oak_planks") or B("minecraft:wooden_door", ...). Bare names get the minecraft: prefix."""
    bid = name if ":" in name else f"minecraft:{name}"
    norm = {}
    for k, v in states.items():
        key = k.replace("__", ":")  # cardinal__direction -> minecraft:cardinal_direction via helper below
        norm[key] = v
    return Block(bid, tuple(sorted(norm.items())))


AIR = None  # air / leave the cleared space empty

# Directions are named by where something FACES (the way a player would look at its front).
CARDINALS = ("south", "west", "north", "east")
_WEIRDO = {"east": 0, "west": 1, "south": 2, "north": 3}  # stairs: the side the tall back rises toward
_BED = {"south": 0, "west": 1, "north": 2, "east": 3}  # beds: the way from foot to head
_TRAP = {"east": 0, "west": 1, "south": 2, "north": 3}  # trapdoors (hinge side), same order as stairs


def stairs(material: str, rises_toward: str, upside_down=False) -> Block:
    """Stairs whose tall back is on the `rises_toward` side (roof slopes rise toward the ridge)."""
    return B(f"{material}_stairs", weirdo_direction=_WEIRDO[rises_toward], upside_down_bit=upside_down)


def slab(material: str, top=False) -> Block:
    return B(f"{material}_slab", **{"minecraft:vertical_half": "top" if top else "bottom"})


def log(material: str, axis="y") -> Block:
    return B(f"{material}_log", pillar_axis=axis)


def door_pair(material: str, facing: str, hinge_right=False):
    """Lower and upper door blocks. `facing` = the way you look when walking OUT of the building."""
    bid = "wooden_door" if material == "oak" else f"{material}_door"
    common = {"minecraft:cardinal_direction": facing, "door_hinge_bit": hinge_right, "open_bit": False}
    return (B(bid, upper_block_bit=False, **{k: v for k, v in common.items()}),
            B(bid, upper_block_bit=True, **{k: v for k, v in common.items()}))


def facing(name: str, toward: str, **extra) -> Block:
    """Blocks with a front (furnace, chest, campfire, fence gate...)."""
    return B(name, **{"minecraft:cardinal_direction": toward}, **extra)


def bed_pair(foot_to_head: str):
    d = _BED[foot_to_head]
    return (B("bed", direction=d, head_piece_bit=False, occupied_bit=False),
            B("bed", direction=d, head_piece_bit=True, occupied_bit=False))


def trapdoor(material: str, hinge: str, top=False, open_=False) -> Block:
    bid = "trapdoor" if material == "oak" else f"{material}_trapdoor"
    return B(bid, direction=_TRAP[hinge], upside_down_bit=top, open_bit=open_)


def lantern(hanging=False) -> Block:
    return B("lantern", hanging=hanging)


# ---------------------------------------------------------------- blueprint


@dataclass
class Blueprint:
    w: int  # x (width)
    h: int  # y (height)
    d: int  # z (depth)
    name: str = ""
    level: int = 1
    grid: dict = field(default_factory=dict)
    notes: list = field(default_factory=list)

    def set(self, x, y, z, b):
        if not (0 <= x < self.w and 0 <= y < self.h and 0 <= z < self.d):
            raise ValueError(f"{self.name} L{self.level}: ({x},{y},{z}) is outside the {self.w}x{self.h}x{self.d} plot")
        if b is None:
            self.grid.pop((x, y, z), None)
        else:
            self.grid[(x, y, z)] = b

    def get(self, x, y, z):
        return self.grid.get((x, y, z))

    def fill(self, x0, y0, z0, x1, y1, z1, b):
        for x in range(min(x0, x1), max(x0, x1) + 1):
            for y in range(min(y0, y1), max(y0, y1) + 1):
                for z in range(min(z0, z1), max(z0, z1) + 1):
                    self.set(x, y, z, b)

    def ring(self, x0, z0, x1, z1, y, b, corners=None):
        """Rectangle outline at height y; optional different corner block."""
        for x in range(x0, x1 + 1):
            for z in range(z0, z1 + 1):
                if x in (x0, x1) or z in (z0, z1):
                    corner = x in (x0, x1) and z in (z0, z1)
                    self.set(x, y, z, corners if (corner and corners) else b)

    def height_used(self):
        return 1 + max((y for (_, y, _) in self.grid), default=0)

    def copy(self, level=None):
        return Blueprint(self.w, self.h, self.d, self.name, level or self.level, dict(self.grid), list(self.notes))


# ---------------------------------------------------------------- export (game format, read by src/scripts)

ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%&()*+-/:;<=>?@[]^_{|}~"


def to_data(bp: Blueprint) -> dict:
    """{ size, palette, layers }: layers[y][z] is a string, one char per x ('.' = air)."""
    palette: list[Block] = []
    index: dict[Block, int] = {}
    height = bp.height_used()
    layers = []
    for y in range(height):
        rows = []
        for z in range(bp.d):
            row = []
            for x in range(bp.w):
                b = bp.get(x, y, z)
                if b is None:
                    row.append(".")
                    continue
                if b not in index:
                    if len(palette) >= len(ALPHABET):
                        raise ValueError(f"{bp.name}: more than {len(ALPHABET)} different blocks")
                    index[b] = len(palette)
                    palette.append(b)
                row.append(ALPHABET[index[b]])
            rows.append("".join(row))
        layers.append(rows)
    return {"size": [bp.w, height, bp.d], "palette": [b.to_json() for b in palette], "layers": layers}


def export_ts(entries: dict, variants: dict, path: str):
    """Writes the generated TypeScript module the game scripts import."""
    body = json.dumps(entries, separators=(",", ":"))
    var = json.dumps(variants, separators=(",", ":"))
    with open(path, "w") as f:
        f.write("// GENERATED by assets-src/structures/build_all.py. Do not edit; change the generators instead.\n")
        f.write("import type { BlueprintData } from \"../blueprint_data.js\";\n\n")
        f.write("/** Key: <faction>/<building>/<variant>/<level>. */\n")
        f.write(f"export const BLUEPRINTS: Record<string, BlueprintData> = {body};\n\n")
        f.write("/** Variants per <faction>/<building>. */\n")
        f.write(f"export const VARIANTS: Record<string, string[]> = {var};\n")
