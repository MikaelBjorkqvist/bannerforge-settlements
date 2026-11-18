// Settlement rules: limits, prosperity, population, defence points and promotion (owner, 2026-11-17: buildings have
// one level, no tier locks; a settlement is promoted with a ledger button once prosperity, population and defence
// points are met). Pure functions (no game imports) so they can be unit-tested.

import { BUILDINGS, PROMOTION, buildingById, type BuildingDef, type Cost, type ScoreCategory } from "./buildings.js";
import type { BuildingLevel, Citizens, Person, Settlement, Site, Tier } from "./types.js";

/** Why an action isn't possible. `key` is a lang key suffix (bannerforge.rule.<key>); args fill its %s slots. */
export interface Reason {
  key: string;
  args: string[];
  /** Lang keys among args (building names, tiers) that the UI should translate rather than print. */
  translateArgs?: number[];
}

export type Action = { kind: "build"; id: string };
export type Check = { ok: true; cost: Cost[]; newLevel: BuildingLevel } | { ok: false; reasons: Reason[] };

/** Every instance of a building: 0 = under construction, 1+ = standing (2 and 3 are left from older saves). */
export function instances(s: Settlement, id: string): BuildingLevel[] {
  return s.buildings[id] ?? [];
}

/** How many instances of a building are standing (finished). */
export function built(s: Settlement, id: string): number {
  return instances(s, id).filter((l) => l > 0).length;
}

function sumOver(s: Settlement, pick: (def: BuildingDef) => number): number {
  let total = 0;
  for (const def of BUILDINGS) total += built(s, def.id) * pick(def);
  return total;
}

// ---------- citizens (M2.5 step 1) ----------

export const citizensOf = (s: Settlement): Citizens => (s.citizens ??= { free: 0, staffed: {} });
const staffedAt = (s: Settlement, id: string, i: number): number => s.citizens?.staffed[id]?.[i] ?? 0;

/** Is this standing building instance working? Buildings without workers always are. */
export function isStaffed(s: Settlement, def: BuildingDef, i: number): boolean {
  return staffedAt(s, def.id, i) >= def.npcs;
}

/** Workers employed in total. */
export function workers(s: Settlement): number {
  let n = 0;
  for (const list of Object.values(s.citizens?.staffed ?? {})) for (const w of list) n += w ?? 0;
  return n;
}

/** Settlers without a job. */
export const freeSettlers = (s: Settlement): number => s.citizens?.free ?? 0;

/** Standing buildings still waiting for (some of) their workers. */
export function waitingForWorkers(s: Settlement): { id: string; index: number; missing: number }[] {
  const out: { id: string; index: number; missing: number }[] = [];
  for (const def of BUILDINGS) {
    if (!def.npcs) continue;
    instances(s, def.id).forEach((level, i) => {
      const missing = def.npcs - staffedAt(s, def.id, i);
      if (level > 0 && missing > 0) out.push({ id: def.id, index: i, missing });
    });
  }
  return out;
}

/** Vanilla job variants (convert.ts): 0 none, 1-13 a profession, 14 nitwit. */
export const NITWIT = 14;
const hasVanillaJob = (p: Person) => (p.vjob ?? 0) >= 1 && (p.vjob ?? 0) < NITWIT;

/**
 * A converted villager becomes the worker of a building instance (automatic hiring of the jobless, or the Recruit
 * button for one with a vanilla job). They move from the villagers list to the roster with the job; the numbers
 * follow (staffed + 1). Their entity is turned into a worker by people.ts.
 */
export function hireVillager(s: Settlement, v: Person, id: string, index: number): void {
  const c = citizensOf(s);
  const list = c.villagers ?? [];
  const i = list.indexOf(v);
  if (i < 0) return;
  list.splice(i, 1);
  delete v.vjob;
  v.job = `${id}:${index}`;
  (c.people ??= []).push(v);
  const staffed = (c.staffed[id] ??= []);
  staffed[index] = (staffed[index] ?? 0) + 1;
}

/**
 * Open jobs are filled, oldest buildings first (owner 2026-11-18): jobless converted villagers first, then free
 * settlers. Nitwits never work (Mojang's joke stays: the player decides what to do with them). Returns the building
 * ids that got a worker.
 */
export function assignJobs(s: Settlement): string[] {
  const c = citizensOf(s);
  const hired: string[] = [];
  for (const w of waitingForWorkers(s)) {
    let missing = w.missing;
    for (const v of (c.villagers ?? []).filter((p) => (p.vjob ?? 0) === 0)) {
      if (missing <= 0) break;
      hireVillager(s, v, w.id, w.index);
      missing--;
      hired.push(w.id);
    }
    const n = Math.min(c.free, missing);
    if (n <= 0) continue;
    const list = (c.staffed[w.id] ??= []);
    list[w.index] = (list[w.index] ?? 0) + n;
    c.free -= n;
    hired.push(w.id);
  }
  return hired;
}

/** Villagers who kept a vanilla job (not nitwits). */
export const vanillaTraders = (s: Settlement): number => (s.citizens?.villagers ?? []).filter(hasVanillaJob).length;
/** Economy bonus from vanilla jobs (owner 2026-11-18): +1 per 3 villagers with a vanilla job, no cap. */
export const vanillaBonus = (s: Settlement): number => Math.floor(vanillaTraders(s) / 3);
/** Villagers with a vanilla job, for the Recruit button. */
export const recruitable = (s: Settlement): Person[] => (s.citizens?.villagers ?? []).filter(hasVanillaJob);

/** The Economy score in parts (ledger breakdown): staffed buildings per group, and the vanilla bonus. */
export function economyParts(s: Settlement): { shops: number; craftsmen: number; food: number; vanilla: number } {
  const out = { shops: 0, craftsmen: 0, food: 0, vanilla: vanillaBonus(s) };
  for (const def of BUILDINGS) {
    if (def.category !== "economy" || !def.group) continue;
    instances(s, def.id).forEach((level, i) => level > 0 && isStaffed(s, def, i) && (out[def.group!] += def.prosperity));
  }
  return out;
}

/**
 * A workplace that no longer stands (destroyed or removed): its workers become free settlers again, they keep
 * nothing of their old job (owner, 2026-11-17: profession locked while the workplace stands).
 */
export function releaseWorkers(s: Settlement): number {
  const c = citizensOf(s);
  let released = 0;
  for (const [id, list] of Object.entries(c.staffed)) {
    list.forEach((w, i) => {
      if (w && !(instances(s, id)[i]! > 0)) {
        c.free += w;
        released += w;
        list[i] = 0;
      }
    });
  }
  return released;
}

/** Food buildings with their worker: each lets one child be born a day (owner 2026-11-18). */
export const FOOD = ["farmstead", "docks"];
export function staffedFood(s: Settlement): number {
  let n = 0;
  for (const id of FOOD) {
    const def = buildingById(id);
    if (def) instances(s, id).forEach((level, i) => level > 0 && isStaffed(s, def, i) && n++);
  }
  return n;
}

/**
 * Dawn (owner 2026-11-18: towns grow by births and by newcomers the player lets stay; nobody just moves in):
 * as many children are born as there are staffed food buildings, up to the free beds; the caller names them
 * (roster.addChild). If people outnumber beds, the unemployed leave first, then the newest workers.
 */
export function morning(s: Settlement): { births: number; left: number } {
  const births = Math.min(staffedFood(s), freeBeds(s));
  return { births, left: evict(s) };
}

/** Developer and tests: every free bed gets a settler now (the pre-2026-11-18 dawn), then too many people leave. */
export function settleAll(s: Settlement): { arrived: number; left: number } {
  const c = citizensOf(s);
  const arrived = freeBeds(s);
  c.free += arrived;
  return { arrived, left: evict(s) };
}

/** People who don't fit in the beds leave: the unemployed first, then the newest workers. Returns how many left. */
function evict(s: Settlement): number {
  const c = citizensOf(s);
  releaseWorkers(s);
  const beds = housing(s);
  // Converted villagers and children take beds too, but never leave by this rule (it is their home).
  let people = population(s);
  let left = 0;
  if (people > beds) {
    const leaveFree = Math.min(c.free, people - beds);
    c.free -= leaveFree;
    left += leaveFree;
    people -= leaveFree;
    // Still too many: the newest workers go (the last-built buildings lose theirs first).
    const posts = Object.entries(c.staffed).flatMap(([id, list]) => list.map((w, i) => ({ id, i, w: w ?? 0 }))).filter((p) => p.w > 0).reverse();
    for (const p of posts) {
      if (people <= beds) break;
      const n = Math.min(p.w, people - beds);
      c.staffed[p.id][p.i] -= n;
      people -= n;
      left += n;
    }
  }
  return left;
}

/**
 * A category's score (owner, 2026-11-18): Economy and Civic from their standing, staffed buildings (no worker, no
 * points); Military from its buildings' defence points (garrisons sleep there, so they are always staffed).
 */
export function score(s: Settlement, category: ScoreCategory): number {
  let total = 0;
  for (const def of BUILDINGS) {
    if (def.category !== category) continue;
    const points = category === "military" ? def.defence ?? 0 : def.prosperity;
    instances(s, def.id).forEach((level, i) => level > 0 && isStaffed(s, def, i) && (total += points));
  }
  return category === "economy" ? total + vanillaBonus(s) : total;
}

/** Prosperity, the town's overall score: Economy + Military + Civic. */
export const prosperity = (s: Settlement): number => score(s, "economy") + score(s, "military") + score(s, "civic");
/** Beds in the houses: a house sleeps as many as its design has beds (stored on its site when placed). Adopted
 *  vanilla houses count their own beds. */
export function housing(s: Settlement): number {
  let total = (s.adopted ?? []).reduce((n, h) => n + h.beds, 0);
  for (const def of BUILDINGS) {
    if (!def.housing) continue;
    instances(s, def.id).forEach((level, i) => {
      if (level > 0) total += (def.category === "housing" ? s.sites?.[def.id]?.[i]?.beds : undefined) ?? def.housing!;
    });
  }
  return total;
}
/** Converted vanilla villagers (owner 2026-11-18): they live in the adopted vanilla houses. */
export const villagers = (s: Settlement): number => s.citizens?.villagers?.length ?? 0;
/** Children born in town (roster.addChild): they take a bed and count; they work once grown. */
export const children = (s: Settlement): number => s.citizens?.children?.length ?? 0;
/** Population: the townsfolk who live there (free settlers, workers and converted villagers). Garrisons are not population. */
export const population = (s: Settlement): number => freeSettlers(s) + workers(s) + villagers(s) + children(s);
/** Military in barracks, towers and the Keep (owner, 2026-11-17: they sleep there and need no townsfolk). */
export const garrison = (s: Settlement): number => sumOver(s, (d) => d.garrison ?? 0);
/** Workers the standing buildings employ (from the townsfolk). */
/** One building's garrison: where it stands, how many soldiers of which kind (owner 2026-11-18). */
export interface Post {
  id: string;
  index: number;
  kind: "melee" | "ranged";
  count: number;
  site: Site;
}

/** Every finished, placed military building with a garrison. Soldiers come with the building, not the population. */
export function posts(s: Settlement): Post[] {
  const out: Post[] = [];
  for (const def of BUILDINGS) {
    if (!def.garrison) continue;
    instances(s, def.id).forEach((level, index) => {
      const site = s.sites?.[def.id]?.[index];
      if (level > 0 && site && site.built > 0) {
        out.push({ id: def.id, index, kind: def.garrisonKind ?? "melee", count: def.garrison!, site });
      }
    });
  }
  return out;
}

/** Garrison rank follows the tier for now (1 Militia/Archer, 2 Soldier/Marksman, 3 Knight/Ranger). */
export const garrisonRank = (s: Settlement): 1 | 2 | 3 => (TIER_ORDER.indexOf(tier(s)) + 1) as 1 | 2 | 3;

export const npcDemand = (s: Settlement): number => sumOver(s, (d) => d.npcs);
/** Military score: defence points of towers, barracks and the Keep (Captain training adds more later). */
export const military = (s: Settlement): number => score(s, "military");

/** Free beds: settlers move into them at the next dawn. */
export const freeBeds = (s: Settlement): number => Math.max(0, housing(s) - population(s));
/** Settlers free for a new job. */
export const freeSlots = freeSettlers;

/** The settlement's tier. Older saves had none: their Town Hall level was the tier (2 = Town, 3 = City). */
export function tier(s: Settlement): Tier {
  if (s.tier) return s.tier;
  const th = instances(s, "town_hall").reduce<number>((m, l) => Math.max(m, l), 0);
  return th >= 3 ? "city" : th >= 2 ? "town" : "village";
}

export const TIER_ORDER: Tier[] = ["village", "town", "city"];

export function nextTier(s: Settlement): "town" | "city" | undefined {
  const t = tier(s);
  return t === "village" ? "town" : t === "town" ? "city" : undefined;
}

/** Can the settlement be promoted now? Every unmet requirement is listed. */
export function checkPromotion(s: Settlement): { next?: "town" | "city"; reasons: Reason[] } {
  const next = nextTier(s);
  if (!next) return { reasons: [{ key: "top_tier", args: [] }] };
  const promo = PROMOTION[next];
  const reasons: Reason[] = [];
  for (const id of promo.requires) {
    if (built(s, id) === 0) reasons.push({ key: "needs_building", args: [`bannerforge.building.${id}`], translateArgs: [0] });
  }
  if (prosperity(s) < promo.prosperity) reasons.push({ key: "promo_prosperity", args: [String(prosperity(s)), String(promo.prosperity)] });
  if (population(s) < promo.population) reasons.push({ key: "promo_population", args: [String(population(s)), String(promo.population)] });
  if (military(s) < promo.military) reasons.push({ key: "promo_military", args: [String(military(s)), String(promo.military)] });
  return { next, reasons };
}

/** Promotes the settlement to its next tier. Call only after checkPromotion() returned no reasons. */
export function promote(s: Settlement): void {
  const next = nextTier(s);
  if (next) s.tier = next;
}

/** Price of the next one: repeatable buildings with a price step cost more for every one you already have. */
export function costFor(s: Settlement, def: BuildingDef): Cost[] {
  return [{ item: "minecraft:emerald", amount: def.emeralds + (def.priceStep ?? 0) * instances(s, def.id).length }];
}

/** Can this building be built right now? Returns the cost, or every reason it is blocked. */
export function check(s: Settlement, action: Action): Check {
  const def = buildingById(action.id);
  if (!def) return { ok: false, reasons: [{ key: "unknown", args: [action.id] }] };
  const count = instances(s, def.id).length;
  if (def.perTier) {
    const limit = def.perTier[tier(s)];
    if (count >= limit) return { ok: false, reasons: [{ key: "limit", args: [String(limit), `bannerforge.tier.${tier(s)}`], translateArgs: [1] }] };
  } else if (count > 0) {
    return { ok: false, reasons: [{ key: "already_built", args: [] }] };
  }
  // Buildings without free workers can still be built (owner, 2026-11-17); they wait for one (M2.5).
  return { ok: true, cost: costFor(s, def), newLevel: 1 };
}

/** Applies a checked build (perimeter-free buildings are placed instead, see placement.ts). */
export function apply(s: Settlement, action: Action, newLevel: BuildingLevel): void {
  (s.buildings[action.id] ??= []).push(newLevel);
}
