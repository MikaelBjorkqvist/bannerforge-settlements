"""Kingscross Guild block palette (docs/styles/kingscross.md). Roles first, so biome variants swap blocks per role."""
from bfstruct import B, log, slab, stairs

ROLES = {
    "foundation": B("stone_bricks"),
    "foundation_alt": B("cobblestone"),
    "lower_wall": B("cobblestone"),
    "frame": "dark_oak",          # posts and beams (logs)
    "wall": B("oak_planks"),      # infill between the frame
    "floor": B("oak_planks"),
    "roof": "oak",                # roof stairs and slabs
    "roof_trim": "dark_oak",      # gable edge / ridge accents
    "window": B("glass_pane"),
    "accent": B("blue_wool"),     # guild blue (cloth, awnings) until banners are possible
    "path": B("grass_path"),
    "fence": B("oak_fence"),
}

# Every block a Kingscross building may use. QA fails on anything else, so the style stays consistent.
ALLOWED = {f"minecraft:{n}" for n in """
stone_bricks cobblestone mossy_cobblestone stone_brick_stairs cobblestone_stairs stone_brick_slab cobblestone_slab
dark_oak_log oak_log stripped_oak_log oak_planks spruce_planks dark_oak_planks
oak_stairs dark_oak_stairs spruce_stairs oak_slab dark_oak_slab spruce_slab
ladder glass_pane wooden_door spruce_door oak_fence dark_oak_fence fence_gate trapdoor spruce_trapdoor
blue_wool blue_carpet white_wool
lantern torch campfire
bed chest barrel furnace crafting_table composter flower_pot bookshelf hay_block
grass_path farmland water wheat carrots potatoes cornflower poppy dandelion oxeye_daisy azalea_leaves oak_leaves
""".split()}


def frame(axis="y"):
    return log(ROLES["frame"], axis)


def roof(rises_toward, upside_down=False):
    return stairs(ROLES["roof"], rises_toward, upside_down)


def roof_slab(top=False):
    return slab(ROLES["roof"], top)
