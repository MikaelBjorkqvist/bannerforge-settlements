// Settlement rules (owner, 2026-11-17: one level per building, no tier locks, promotion button by prosperity,
// population and defence points). Run with: npm test
import assert from "node:assert/strict";
import * as R from "../.test-build/rules.mjs";

const s = { schema: 3, id: "t", name: "T", faction: "blue", dimension: "overworld", center: { x: 0, y: 0, z: 0 }, foundedBy: "p", foundedAt: 0, buildings: {} };
const keys = (c) => (c.ok ? "ok" : c.reasons.map((r) => r.key).join(","));
const act = (id) => {
  const c = R.check(s, { kind: "build", id });
  assert.equal(c.ok, true, `build ${id}: ${keys(c)}`);
  R.apply(s, { kind: "build", id }, c.newLevel);
  return c;
};
const promoKeys = () => R.checkPromotion(s).reasons.map((r) => r.key).join(",");

// A new settlement is a Village. Nothing is locked by tier, and no free workers doesn't block building.
assert.equal(R.tier(s), "village");
for (const id of ["keep", "stables", "barracks", "market"]) assert.equal(keys(R.check(s, { kind: "build", id })), "ok", id);
assert.equal(R.check(s, { kind: "build", id: "market" }).cost[0].amount, 6);

// Promotion needs a Town Hall, prosperity, population and defence points.
assert.equal(promoKeys(), "needs_building,promo_prosperity,promo_population,promo_defence");

// Unique buildings once; houses and watchtowers up to the tier's limit.
act("town_hall");
assert.equal(keys(R.check(s, { kind: "build", id: "town_hall" })), "already_built");
// Houses (owner, 2026-11-17): no limit, each costs 1 more than the last; a house sleeps as many as its design's beds.
for (let i = 0; i < 4; i++) assert.equal(act("house").cost[0].amount, 3 + i);
assert.equal(R.check(s, { kind: "build", id: "house" }).cost[0].amount, 7);
assert.equal(R.population(s), 8, "no design stored: 2 each");
s.sites = { house: [{ beds: 4 }, null, { beds: 2 }, null] };
assert.equal(R.population(s), 4 + 2 + 2 + 2, "a 4-bed design sleeps 4");
delete s.sites;

// Under construction (level 0) counts for limits but gives nothing yet.
s.buildings.watchtower = [0];
assert.equal(R.defence(s), 0);
s.buildings.watchtower = [1, 1];
assert.equal(R.defence(s), 4, "two watchtowers = 4 defence points");
assert.equal(R.population(s), 8, "garrisons are not population (owner, 2026-11-17)");
assert.equal(R.garrison(s), 2, "one archer per tower");
assert.equal(R.freeSlots(s), 8, "...and need no townsfolk");
act("watchtower");
assert.equal(keys(R.check(s, { kind: "build", id: "watchtower" })), "limit");

// Workers: jobs beyond the population show as negative free slots (buildings wait for workers).
for (const id of ["market", "tavern", "shrine", "blacksmith", "fletcher", "alchemist", "warehouse", "farmstead", "docks"]) act(id);
assert.ok(R.freeSlots(s) < 0, `free ${R.freeSlots(s)}`);
assert.equal(R.npcDemand(s), 9, "nine workshops, nine workers; the archers aren't counted as workers");

// Town: 22 prosperity, 6 population, 4 defence, Town Hall. The button promotes; nothing is rebuilt.
assert.ok(R.prosperity(s) >= 22, `prosperity ${R.prosperity(s)}`);
assert.equal(promoKeys(), "");
assert.equal(R.checkPromotion(s).next, "town");
R.promote(s);
assert.equal(R.tier(s), "town");


// City: 40 prosperity, 14 population, 12 defence.
assert.equal(R.checkPromotion(s).next, "city");
assert.match(promoKeys(), /promo_population/);
for (let i = 0; i < 4; i++) act("house");
act("barracks");
act("keep");
for (const id of ["stables", "stonemason", "woodcarver"]) act(id);
assert.ok(R.defence(s) >= 12, `defence ${R.defence(s)}`);
assert.equal(promoKeys(), "");
R.promote(s);
assert.equal(R.tier(s), "city");
assert.equal(R.checkPromotion(s).next, undefined);
// Barracks: one per Village, two per Town, three per City; 4 workers each.
assert.equal(keys(R.check(s, { kind: "build", id: "barracks" })), "ok");
act("barracks");
act("barracks");
assert.equal(keys(R.check(s, { kind: "build", id: "barracks" })), "limit");

// Older saves: no stored tier, the Town Hall level was the tier; level 2+ buildings count once.
const old = { ...s, tier: undefined, buildings: { town_hall: [2], market: [3], house: [2, 1] } };
assert.equal(R.tier(old), "town");
assert.equal(R.prosperity(old), 5 + 4 + 2);
assert.equal(R.population(old), 4);
// The old "Defences" perimeter purchase no longer counts for anything.
assert.equal(R.defence({ ...old, buildings: { defences: [1] } }), 0);
