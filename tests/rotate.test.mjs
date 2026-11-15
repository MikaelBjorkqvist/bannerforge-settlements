// Block states turn with the plot. Run with: npm test
import assert from "node:assert/strict";
import { rotateStates as r } from "../.test-build/rotate.mjs";

const door = { "minecraft:cardinal_direction": "south", upper_block_bit: false };
assert.equal(r("minecraft:wooden_door", door, 0), door, "no turn, same object");
assert.equal(r("minecraft:wooden_door", door, 1)["minecraft:cardinal_direction"], "west", "rot 1: entrance faces west");
assert.equal(r("minecraft:wooden_door", door, 2)["minecraft:cardinal_direction"], "north");
assert.equal(r("minecraft:wooden_door", door, 3)["minecraft:cardinal_direction"], "east");
assert.equal(r("minecraft:wooden_door", door, 1).upper_block_bit, false, "other states kept");

// Stairs rising east (west roof slope) turn with the plot: east -> south -> west -> north.
assert.equal(r("minecraft:oak_stairs", { weirdo_direction: 0 }, 1).weirdo_direction, 2);
assert.equal(r("minecraft:oak_stairs", { weirdo_direction: 0 }, 2).weirdo_direction, 1);
assert.equal(r("minecraft:oak_stairs", { weirdo_direction: 0 }, 3).weirdo_direction, 3);
// Beds use south/west/north/east; trapdoors use the stairs order.
assert.equal(r("minecraft:bed", { direction: 2 }, 1).direction, 3, "bed pointing north turns to east");
assert.equal(r("minecraft:trapdoor", { direction: 3 }, 1).direction, 0, "trapdoor north turns to east");
// Ladders and barrels: horizontal facings turn, up/down stay.
assert.equal(r("minecraft:ladder", { facing_direction: 4 }, 1).facing_direction, 2, "west turns to north");
assert.equal(r("minecraft:barrel", { facing_direction: 1 }, 1).facing_direction, 1);
// Logs swap x/z on quarter turns; signs turn by 4 steps of 16.
assert.equal(r("minecraft:dark_oak_log", { pillar_axis: "x" }, 1).pillar_axis, "z");
assert.equal(r("minecraft:dark_oak_log", { pillar_axis: "y" }, 3).pillar_axis, "y");
assert.equal(r("minecraft:standing_sign", { ground_sign_direction: 14 }, 1).ground_sign_direction, 2);
