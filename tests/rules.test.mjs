// Settlement rules (docs/BUILDINGS.md). Run with: npm test
import assert from "node:assert/strict";
import * as R from "../.test-build/rules.mjs";

const s = { schema: 3, id: "t", name: "T", faction: "blue", dimension: "overworld", center: { x: 0, y: 0, z: 0 }, foundedBy: "p", foundedAt: 0, buildings: {} };
const keys = (c) => (c.ok ? "ok" : c.reasons.map((r) => r.key).join(","));
const act = (a) => {
  const c = R.check(s, a);
  assert.equal(c.ok, true, `${a.kind} ${a.id}: ${keys(c)}`);
  R.apply(s, a, c.newLevel);
  return c;
};

// A new settlement is a Village; tier-gated and prerequisite buildings are locked.
assert.equal(R.tier(s), "village");
assert.equal(keys(R.check(s, { kind: "build", id: "keep" })), "needs_tier,needs_building,needs_population");
assert.equal(keys(R.check(s, { kind: "build", id: "barracks" })), "needs_building,needs_population");

// No houses = no free population slots: buildings with workers are blocked; worker-free ones are not.
assert.equal(keys(R.check(s, { kind: "build", id: "market" })), "needs_population");
act({ kind: "build", id: "town_hall" });
act({ kind: "build", id: "defences" });

// Town Hall L2 is the promotion step and needs the Town requirements.
assert.equal(keys(R.check(s, { kind: "upgrade", id: "town_hall", index: 0 })), "promo_prosperity,promo_population");

// 4 houses (Village limit) = 8 free slots.
for (let i = 0; i < 4; i++) act({ kind: "build", id: "house" });
assert.equal(keys(R.check(s, { kind: "build", id: "house" })), "limit");
assert.equal(R.freeSlots(s), 8);
for (const id of ["market", "tavern", "shrine", "blacksmith", "fletcher", "alchemist", "warehouse", "farmstead"]) act({ kind: "build", id });
assert.equal(R.freeSlots(s), 0);
assert.equal(keys(R.check(s, { kind: "build", id: "stonemason" })), "needs_population");
assert.equal(keys(R.check(s, { kind: "upgrade", id: "market", index: 0 })), "tier_cap,needs_population");

// Promote: prosperity >= 30 and population 8 >= 6.
assert.ok(R.prosperity(s) >= 30, `prosperity ${R.prosperity(s)}`);
act({ kind: "upgrade", id: "town_hall", index: 0 });
assert.equal(R.tier(s), "town");

// Upgrading a house adds 1 slot (+2 -> +3), enough for Market L2's extra worker.
act({ kind: "upgrade", id: "house", index: 0 });
assert.equal(R.freeSlots(s), 1);
act({ kind: "upgrade", id: "market", index: 0 });
assert.equal(R.freeSlots(s), 0);

// Stonemason L3 gives 20% off defences.
s.buildings.stonemason = [3];
assert.equal(R.costFor(s, { id: "defences", emeralds: [16, 32, 64] }, 2)[0].amount, 26);
