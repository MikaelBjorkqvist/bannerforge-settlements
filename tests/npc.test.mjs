// NPC naming and steward respawn timing. Run with: npm test
import assert from "node:assert/strict";
import * as N from "../.test-build/npc.mjs";

assert.equal(N.pickName("abc"), N.pickName("abc"), "same seed, same name");
assert.ok(N.NPC_NAMES.includes(N.pickName("xyz")));
const spread = new Set(Array.from({ length: 200 }, (_, i) => N.pickIndex("seed" + i, 30)));
assert.ok(spread.size > 20, "names spread over the pool");

assert.equal(N.respawnTicksLeft(undefined, 5000), 0, "never died: may appear now");
assert.equal(N.respawnTicksLeft(1000, 1000), 24000);
assert.equal(N.respawnTicksLeft(1000, 25000), 0);
assert.equal(N.respawnTicksLeft(1000, 99999), 0);
assert.equal(N.ticksToMinutes(24000), 20, "one in-game day is 20 real minutes");
assert.equal(N.ticksToMinutes(1), 1);
assert.equal(N.ticksToMinutes(1201), 2);
