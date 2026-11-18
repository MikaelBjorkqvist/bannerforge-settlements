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
assert.equal(promoKeys(), "needs_building,promo_prosperity,promo_population,promo_military");

// Unique buildings once; houses and watchtowers up to the tier's limit.
act("town_hall");
assert.equal(keys(R.check(s, { kind: "build", id: "town_hall" })), "already_built");
// Houses (owner, 2026-11-17): no limit, each costs 1 more than the last; a house sleeps as many as its design's beds.
for (let i = 0; i < 4; i++) assert.equal(act("house").cost[0].amount, 3 + i);
assert.equal(R.check(s, { kind: "build", id: "house" }).cost[0].amount, 7);
assert.equal(R.housing(s), 8, "no design stored: 2 beds each");
s.sites = { house: [{ beds: 4 }, null, { beds: 2 }, null] };
assert.equal(R.housing(s), 4 + 2 + 2 + 2, "a 4-bed design sleeps 4");
delete s.sites;

// Settlers (owner, 2026-11-17): nobody lives there until the next dawn; then every free bed fills.
assert.equal(R.population(s), 0);
assert.deepEqual(R.morning(s), { arrived: 8, left: 0 });
assert.equal(R.population(s), 8);
assert.equal(R.freeBeds(s), 0);
assert.deepEqual(R.morning(s), { arrived: 0, left: 0 }, "a full town: nobody new");

// Under construction (level 0) counts for limits but gives nothing yet.
s.buildings.watchtower = [0];
assert.equal(R.military(s), 0);
s.buildings.watchtower = [1, 1];
assert.equal(R.military(s), 4, "two watchtowers = 4 defence points");
assert.equal(R.population(s), 8, "garrisons are not population (owner, 2026-11-17)");
assert.equal(R.garrison(s), 2, "one archer per tower");
assert.equal(R.freeSlots(s), 8, "...and need no townsfolk");
assert.deepEqual(R.assignJobs(s), [], "towers take nobody");
act("watchtower");
assert.equal(keys(R.check(s, { kind: "build", id: "watchtower" })), "limit");

// Jobs: free settlers take them automatically; the rest of the buildings wait (and give no prosperity yet).
for (const id of ["market", "tavern", "shrine", "blacksmith", "fletcher", "alchemist", "warehouse", "farmstead", "docks"]) act(id);
assert.equal(R.npcDemand(s), 9, "nine workshops, nine workers; the archers aren't counted as workers");
const before = R.prosperity(s);
assert.equal(R.assignJobs(s).length, 8, "8 settlers, 8 jobs taken");
assert.equal(R.freeSlots(s), 0);
assert.equal(R.waitingForWorkers(s).length, 1, "one workshop still waits");
assert.ok(R.prosperity(s) > before, "staffed workshops give prosperity");
assert.equal(R.population(s), 8, "workers are still townsfolk");

// Prosperity = Economy + Military + Civic (owner, 2026-11-18).
assert.equal(R.prosperity(s), R.score(s, "economy") + R.score(s, "military") + R.score(s, "civic"));
assert.equal(R.score(s, "military"), 6, "three watchtowers");
assert.equal(R.score(s, "civic"), 5, "Town Hall; the shrine still waits for a worker (no worker, no points)");
// Town: 26 prosperity, 6 population, 4 military, Town Hall. The button promotes; nothing is rebuilt.
assert.ok(R.prosperity(s) >= 26, `prosperity ${R.prosperity(s)}`);
assert.equal(promoKeys(), "");
assert.equal(R.checkPromotion(s).next, "town");
R.promote(s);
assert.equal(R.tier(s), "town");


// City: 52 prosperity, 14 population, 12 military.
assert.equal(R.checkPromotion(s).next, "city");
assert.match(promoKeys(), /promo_population/);
for (let i = 0; i < 4; i++) act("house");
R.morning(s);
R.assignJobs(s);
assert.equal(R.population(s), 16);
assert.equal(R.waitingForWorkers(s).length, 0);
act("barracks");
act("keep");
for (const id of ["stables", "stonemason", "woodcarver"]) act(id);
R.assignJobs(s);
assert.ok(R.military(s) >= 12, `military ${R.military(s)}`);
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
const old = { ...s, tier: undefined, citizens: undefined, buildings: { town_hall: [2], market: [3], house: [2, 1] } };
assert.equal(R.tier(old), "town");
assert.equal(R.prosperity({ ...old, citizens: { free: 0, staffed: { market: [1] } } }), 5 + 4);
assert.equal(R.prosperity(old), 5, "the market has no worker on an old save until the first dawn");
assert.equal(R.housing(old), 4);
assert.equal(R.population(old), 0, "nobody lives there until the first dawn after the update");
// The old "Defences" perimeter purchase no longer counts for anything.
assert.equal(R.military({ ...old, buildings: { defences: [1] } }), 0);

// Fewer beds than people: the unemployed leave first, then the newest workers.
const t = { buildings: { house: [1], market: [1], tavern: [1] }, citizens: { free: 1, staffed: { market: [1], tavern: [1] } } };
assert.deepEqual(R.morning(t), { arrived: 0, left: 1 }, "3 people, 2 beds: the free settler leaves");
assert.equal(R.workers(t), 2);
t.citizens.staffed.tavern[0] = 1;
t.buildings.house = [0]; // the house is being rebuilt: no beds tonight
assert.deepEqual(R.morning(t), { arrived: 0, left: 2 });
assert.equal(R.population(t), 0);
// A workplace that no longer stands: its worker is free again.
const u = { buildings: { market: [] }, citizens: { free: 0, staffed: { market: [1] } } };
assert.equal(R.releaseWorkers(u), 1);
assert.equal(R.freeSettlers(u), 1);


// Garrisons (owner 2026-11-18): only finished, placed military buildings have a post; towers hold archers,
// barracks and the Keep melee soldiers; the rank follows the tier.
{
  const site = (built) => ({ x: 0, y: 64, z: 0, w: 9, rot: 0, built });
  const g = {
    ...s,
    tier: "village",
    buildings: { watchtower: [1, 1, 1], barracks: [1], keep: [1], market: [1] },
    sites: { watchtower: [site(1), site(0), null], barracks: [site(1)], keep: [site(1)], market: [site(1)] },
  };
  const p = R.posts(g).map((x) => `${x.id}#${x.index}:${x.kind}x${x.count}`);
  assert.deepEqual(p, ["watchtower#0:rangedx1", "barracks#0:meleex4", "keep#0:meleex2"], "unfinished or unplaced towers have no post");
  assert.equal(R.garrisonRank(g), 1);
  assert.equal(R.garrisonRank({ ...g, tier: "town" }), 2);
  assert.equal(R.garrisonRank({ ...g, tier: "city" }), 3);
}
