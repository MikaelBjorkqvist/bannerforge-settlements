"""Kingscross Guild block palette (docs/styles/kingscross.md v1). Roles first, so biome variants swap blocks per role.

Owner decisions 2026-11-15: light plaster between dark timber; dark wood roofs with stone-brick trim;
guild colour as blue-and-white wool (awnings, flags) because banner colours can't be set from scripts.
"""
from bfstruct import B, log, slab, stairs

ROLES = {
    "foundation": B("stone_bricks"),
    "foundation_alt": B("cobblestone"),
    "lower_wall": B("cobblestone"),
    "corner_stone": B("stone_bricks"),
    "frame": "dark_oak",            # posts and beams (logs)
    "wall": B("calcite"),           # light plaster infill between the frame
    "floor": B("spruce_planks"),
    "roof": "spruce",               # roof surface stairs and slabs (dark wood)
    "roof_trim": "stone_brick",     # verges (gable edges) and ridge ends
    "window": B("glass_pane"),
    "chimney": B("brick_block"),
    "accent": B("blue_wool"),       # guild blue
    "accent_light": B("white_wool"),
    "path": B("grass_path"),
    "fence": B("spruce_fence"),
}

# Every block a Kingscross building may use. QA fails on anything else, so the style stays consistent.
ALLOWED = {f"minecraft:{n}" for n in """
stone_bricks cobblestone mossy_cobblestone stone_brick_stairs cobblestone_stairs stone_brick_slab cobblestone_slab
dark_oak_log spruce_log stripped_dark_oak_log calcite spruce_planks oak_planks dark_oak_planks brick_block brick_stairs
spruce_stairs dark_oak_stairs oak_stairs spruce_slab dark_oak_slab
ladder glass_pane spruce_door wooden_door spruce_fence dark_oak_fence spruce_fence_gate fence_gate spruce_trapdoor trapdoor
blue_wool white_wool blue_carpet white_carpet
lantern torch campfire
bed chest barrel furnace smoker crafting_table composter flower_pot bookshelf hay_block
grass_path farmland water wheat carrots potatoes beetroot cornflower poppy dandelion oxeye_daisy azalea_leaves oak_leaves
""".split()}


def frame(axis="y"):
    return log(ROLES["frame"], axis)


def roof(rises_toward, upside_down=False):
    return stairs(ROLES["roof"], rises_toward, upside_down)


def trim(rises_toward, upside_down=False):
    return stairs(ROLES["roof_trim"], rises_toward, upside_down)


def roof_slab(top=False):
    return slab(ROLES["roof"], top)


def trim_slab(top=False):
    return slab(ROLES["roof_trim"], top)
