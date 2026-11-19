// Soldier duties (owner 2026-11-19): the Captain's defaults and the player's choices. Run with: npm test
import assert from "node:assert/strict";
import * as D from "../.test-build/duties.mjs";

const barracks = { id: "barracks", kind: "melee" };
const tower = { id: "watchtower", kind: "ranged" };
assert.equal(D.defaultRole(tower, 0, true), "tower");
assert.deepEqual([0, 1, 2, 3].map((n) => D.defaultRole(barracks, n, true)), ["barracks", "patrol", "gate", "gate"]);
assert.deepEqual([0, 1, 2, 3].map((n) => D.defaultRole(barracks, n, false)), ["barracks", "patrol", "border", "border"]);
assert.ok(!D.rolesFor(tower).includes("patrol"));

const s = { buildings: {} };
D.setDuty(s, "a:2", "patrol");
assert.equal(s.duties["a:2"], "patrol");
D.setDuty(s, "a:2", undefined);
assert.equal(s.duties, undefined, "clearing the last choice drops the record");

const all = [
  { key: "a:0", role: "barracks" },
  { key: "a:2", role: "gate" },
  { key: "a:3", role: "gate" },
  { key: "b:2", role: "gate" },
];
assert.equal(D.placeIndex(all, "a:3"), 1);
assert.equal(D.placeIndex(all, "b:2"), 2);
