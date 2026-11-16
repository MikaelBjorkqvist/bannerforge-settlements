// Java structure template -> Bedrock translation (tools/structures). Pure Node, no game needed.
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { translateState, parseStateString, convertTemplate } from "../tools/structures/java_to_bedrock.mjs";
import { readNbt } from "../tools/structures/nbt.mjs";

const first = (name, Properties) => translateState({ Name: `minecraft:${name}`, Properties })[0];

// markers are dropped
assert.equal(translateState({ Name: "minecraft:structure_block", Properties: { mode: "data" } }), null);
assert.equal(translateState({ Name: "minecraft:jigsaw" }), null);

// stairs: facing -> weirdo_direction, half -> upside_down_bit, shape left to Bedrock; cobblestone stairs are stone_stairs
assert.deepEqual(first("oak_stairs", { facing: "north", half: "top", shape: "outer_left", waterlogged: "false" }), { name: "oak_stairs", states: { weirdo_direction: 3, upside_down_bit: true } });
assert.equal(first("cobblestone_stairs", { facing: "east", half: "bottom" }).name, "stone_stairs");

// slabs and double slabs
assert.deepEqual(first("spruce_slab", { type: "top" }), { name: "spruce_slab", states: { "minecraft:vertical_half": "top" } });
assert.equal(first("smooth_stone_slab", { type: "double" }).name, "smooth_stone_double_slab");

// logs and doors
assert.deepEqual(first("stripped_oak_log", { axis: "x" }), { name: "stripped_oak_log", states: { pillar_axis: "x" } });
const door = translateState({ Name: "minecraft:oak_door", Properties: { facing: "west", half: "upper", hinge: "right", open: "false" } });
assert.equal(door[0].name, "wooden_door");
assert.equal(door[0].states.upper_block_bit, true);
assert.equal(door[1].states.direction, 2);

// renames and flattened families keep a legacy fallback
assert.equal(first("grass").name, "short_grass");
assert.equal(first("potted_spruce_sapling").name, "flower_pot");
assert.deepEqual(translateState({ Name: "minecraft:white_wool" })[1], { name: "wool", states: { color: "white" } });
assert.deepEqual(first("wall_torch", { facing: "south" }), { name: "torch", states: { torch_facing_direction: "south" } });
assert.deepEqual(first("snow", { layers: "3" }), { name: "snow_layer", states: { height: 2, covered_bit: false } });

// jigsaw final_state strings
assert.deepEqual(parseStateString("minecraft:oak_stairs[facing=east,half=bottom]"), { Name: "minecraft:oak_stairs", Properties: { facing: "east", half: "bottom" } });
assert.deepEqual(parseStateString("minecraft:air"), { Name: "minecraft:air", Properties: {} });

// convertTemplate: jigsaw -> final_state, street jigsaw sets dy, air only below the surface
const tpl = {
  size: [2, 3, 1],
  palette: [{ Name: "minecraft:cobblestone" }, { Name: "minecraft:air" }, { Name: "minecraft:jigsaw", Properties: { facing: "west" } }],
  blocks: [
    { pos: [0, 0, 0], state: 0 },
    { pos: [1, 0, 0], state: 1 }, // below surface (dy = -1): kept, carves the ground
    { pos: [1, 2, 0], state: 1 }, // above surface: skipped
    { pos: [0, 2, 0], state: 2, nbt: { target_pool: "minecraft:village/plains/streets", final_state: "minecraft:oak_planks", attachement_type: "minecraft:building_entrance" } },
  ],
};
const out = convertTemplate(tpl);
assert.equal(out.dy, -1);
assert.equal(out.blocks.length / 4, 3);
assert.equal(out.palette[out.blocks[11]][0].name, "oak_planks");

// NBT reader: gzip big-endian compound with a string and an int list
const be = Buffer.from([10, 0, 0, 8, 0, 1, 0x6e, 0, 2, 0x68, 0x69, 9, 0, 4, 0x73, 0x69, 0x7a, 0x65, 3, 0, 0, 0, 2, 0, 0, 0, 7, 0, 0, 0, 9, 0]);
assert.deepEqual(readNbt(zlib.gzipSync(be)), { n: "hi", size: [7, 9] });

// 1.21 names from third-party schematics
assert.equal(first("stone_slab", { type: "bottom" }).name, "normal_stone_slab");
assert.equal(first("stone_stairs", { facing: "east", half: "bottom" }).name, "normal_stone_stairs");
assert.deepEqual(first("white_candle", { candles: "3", lit: "false" }), { name: "white_candle", states: { candles: 2, lit: false } });
assert.deepEqual(first("deepslate", { axis: "z" }), { name: "deepslate", states: { pillar_axis: "z" } });
assert.equal(translateState({ Name: "minecraft:fire", Properties: {} }), null);
assert.equal(first("acacia_wall_hanging_sign", { facing: "east" }).name, "acacia_hanging_sign");

// Sponge schematic v3: 2x1x1, palette air=0, stone=1, varint data
import { schemToTemplate } from "../tools/structures/schem.mjs";
const schem = schemToTemplate({ Schematic: { Version: 3, Width: 2, Height: 1, Length: 1, Blocks: { Palette: { "minecraft:air": 0, "minecraft:oak_stairs[facing=west]": 1 }, Data: [0, 1] } } });
assert.deepEqual(schem.size, [2, 1, 1]);
assert.equal(schem.palette[schem.blocks[1].state].Properties.facing, "west");

// building roles for dev-tool labels
import { classify } from "../tools/structures/roles.mjs";
assert.deepEqual(classify("Black Smith"), { kind: "vanilla", role: "weaponsmith" });
assert.deepEqual(classify("Town Hall"), { kind: "new", role: "addon" });
assert.equal(classify("Igloo 2").role, "house");
