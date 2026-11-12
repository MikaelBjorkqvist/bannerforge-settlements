// Settlement rules (docs/BUILDINGS.md). Run with: npm test
import assert from "node:assert/strict";
import * as R from "../.test-build/rules.mjs";

const s = { schema: 2, id: "t", name: "T", faction: "green", dimension: "overworld", center: { x: 0, y: 0, z: 0 }, foundedBy: "p", foundedAt: 0, buildings: {} };
const keys = (c) => (c.ok ? "ok" : c.reasons.map((r) => r.key).join(","));
const act = (a) => {
  const c = R.check(s, a);
  assert.equal(c.ok, true, `${a.kind} ${a.id}: ${keys(c)}`);
  R.apply(s, a, c.newLevel);
  return c;
};

// A new settlement is a Village; tier-gated and prerequisite buildings are locked.
assert.equal(R.tier(s), "village");
assert.equal(keys(R.check(s, { kind: "build", id: "keep" })), "needs_tier,needs_building");
assert.equal(keys(R.check(s, { kind: "build", id: "barracks" })), "needs_building");

// Town Hall L2 is the promotion step and needs the Town requirements.
act({ kind: "build", id: "town_hall" });
assert.equal(keys(R.check(s, { kind: "upgrade", id: "town_hall", index: 0 })), "promo_prosperity,promo_population,needs_building");

// Village caps other buildings at level 1; houses are limited to 4.
act({ kind: "build", id: "market" });
assert.equal(keys(R.check(s, { kind: "upgrade", id: "market", index: 0 })), "tier_cap");
for (let i = 0; i < 4; i++) act({ kind: "build", id: "house" });
assert.equal(keys(R.check(s, { kind: "build", id: "house" })), "limit");
assert.equal(R.housing(s), 8); // 4 houses x +2

// Fill the village, then promote.
for (const id of ["walls", "tavern", "warehouse", "farmstead", "blacksmith", "fletcher", "alchemist", "shrine", "barracks"]) act({ kind: "build", id });
assert.ok(R.prosperity(s) >= 30);
assert.equal(R.population(s), 8); // demand 11, capped by housing 8
act({ kind: "upgrade", id: "town_hall", index: 0 });
assert.equal(R.tier(s), "town");
assert.equal(keys(R.check(s, { kind: "build", id: "keep" })), "ok");
assert.equal(keys(R.check(s, { kind: "upgrade", id: "market", index: 0 })), "ok");

// Stonemason L3 gives 20% off walls.
s.buildings.stonemason = [3];
assert.equal(R.costFor(s, { id: "walls", emeralds: [10, 20, 40] }, 2)[0].amount, 16);
