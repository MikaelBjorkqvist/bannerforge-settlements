// Settlement rules from docs/BUILDINGS.md: tier caps, prerequisites, repeatable limits, population,
// prosperity and promotion via the Town Hall. Pure functions (no game imports) so they can be unit-tested.

import { BUILDINGS, DISCOUNTS, PROMOTION, TIER_MAX_LEVEL, buildingById, type BuildingDef, type BuildingReq, type Cost } from "./buildings.js";
import type { BuildingLevel, Settlement, Tier } from "./types.js";

/** Why an action isn't possible. `key` is a lang key suffix (bannerforge.rule.<key>); args fill its %s slots. */
export interface Reason {
  key: string;
  args: string[];
  /** Lang keys among args (building names, tiers) that the UI should translate rather than print. */
  translateArgs?: number[];
}

export type Action = { kind: "build"; id: string } | { kind: "upgrade"; id: string; index: number };
export type Check = { ok: true; cost: Cost[]; newLevel: BuildingLevel } | { ok: false; reasons: Reason[] };

export function instances(s: Settlement, id: string): BuildingLevel[] {
  return s.buildings[id] ?? [];
}

/** Highest level of a building in the settlement (0 if not built). */
export function highest(s: Settlement, id: string): BuildingLevel {
  return instances(s, id).reduce<BuildingLevel>((m, l) => (l > m ? l : m), 0);
}

function sumOver(s: Settlement, pick: (def: BuildingDef, level: 1 | 2 | 3) => number): number {
  let total = 0;
  for (const def of BUILDINGS) {
    for (const level of instances(s, def.id)) {
      for (let l = 1; l <= level; l++) total += pick(def, l as 1 | 2 | 3);
    }
  }
  return total;
}

/** Total prosperity: every built level of every building adds its points. */
export function prosperity(s: Settlement): number {
  return sumOver(s, (d, l) => d.prosperity[l - 1]);
}

/** Population cap from houses. A house's level gives its own housing value (not cumulative). */
export function housing(s: Settlement): number {
  let total = 0;
  for (const def of BUILDINGS) {
    if (!def.housing) continue;
    for (const level of instances(s, def.id)) if (level > 0) total += def.housing[level - 1];
  }
  return total;
}

/** How many NPCs the buildings want to employ (at their current level). */
export function npcDemand(s: Settlement): number {
  let total = 0;
  for (const def of BUILDINGS) {
    for (const level of instances(s, def.id)) if (level > 0) total += def.npcs[level - 1];
  }
  return total;
}

/** Population = NPCs actually living there: as many as are wanted, up to the housing cap. */
export function population(s: Settlement): number {
  return Math.min(npcDemand(s), housing(s));
}

/** The tier follows the Town Hall: level 2 = Town, level 3 = City. */
export function tier(s: Settlement): Tier {
  const th = highest(s, "town_hall");
  return th >= 3 ? "city" : th >= 2 ? "town" : "village";
}

const TIER_ORDER: Tier[] = ["village", "town", "city"];
const tierAtLeast = (have: Tier, need: Tier) => TIER_ORDER.indexOf(have) >= TIER_ORDER.indexOf(need);

export function maxLevelFor(s: Settlement, def: BuildingDef): number {
  return Math.min(3, TIER_MAX_LEVEL[tier(s)] + (def.promotes ? 1 : 0));
}

function unmet(s: Settlement, reqs: BuildingReq[] | undefined): Reason[] {
  return (reqs ?? [])
    .filter((r) => highest(s, r.id) < r.level)
    .map((r) => ({ key: "needs_building", args: [`bannerforge.building.${r.id}`, `bannerforge.level.${r.level}`], translateArgs: [0, 1] }));
}

/** Cost of reaching `level` of `def`, after discounts. */
export function costFor(s: Settlement, def: BuildingDef, level: 1 | 2 | 3): Cost[] {
  let percent = 0;
  for (const d of DISCOUNTS) if (d.to.includes(def.id) && highest(s, d.from) >= 3) percent += d.percent;
  const amount = Math.max(1, Math.round(def.emeralds[level - 1] * (1 - percent / 100)));
  return [{ item: "minecraft:emerald", amount }];
}

/** Can this action be taken right now? Returns the cost, or every reason it is blocked. */
export function check(s: Settlement, action: Action): Check {
  const def = buildingById(action.id);
  if (!def) return { ok: false, reasons: [{ key: "unknown", args: [action.id] }] };
  const list = instances(s, def.id);

  let current: BuildingLevel;
  if (action.kind === "build") {
    if (def.perTier) {
      const limit = def.perTier[tier(s)];
      if (list.length >= limit) return { ok: false, reasons: [{ key: "limit", args: [String(limit), `bannerforge.tier.${tier(s)}`], translateArgs: [1] }] };
    } else if (list.length > 0) {
      return { ok: false, reasons: [{ key: "already_built", args: [] }] };
    }
    current = 0;
  } else {
    const level = list[action.index];
    if (level === undefined) return { ok: false, reasons: [{ key: "unknown", args: [action.id] }] };
    current = level;
  }

  if (current >= 3) return { ok: false, reasons: [{ key: "max_level", args: [] }] };
  const next = (current + 1) as 1 | 2 | 3;
  const reasons: Reason[] = [];

  if (next === 1 && def.minTier && !tierAtLeast(tier(s), def.minTier)) {
    reasons.push({ key: "needs_tier", args: [`bannerforge.tier.${def.minTier}`], translateArgs: [0] });
  }
  if (next === 1) reasons.push(...unmet(s, def.requires));

  if (next > maxLevelFor(s, def)) {
    const nextTier = TIER_ORDER[TIER_ORDER.indexOf(tier(s)) + 1] ?? "city";
    reasons.push({ key: "tier_cap", args: [`bannerforge.tier.${nextTier}`], translateArgs: [0] });
  }

  // Town Hall levels 2 and 3 are promotions: they need the next tier's prosperity, population and buildings.
  if (def.promotes && next >= 2) {
    const promo = next === 2 ? PROMOTION.town : PROMOTION.city;
    const p = prosperity(s);
    const pop = population(s);
    if (p < promo.prosperity) reasons.push({ key: "promo_prosperity", args: [String(p), String(promo.prosperity)] });
    if (pop < promo.population) reasons.push({ key: "promo_population", args: [String(pop), String(promo.population)] });
    reasons.push(...unmet(s, promo.requires));
  }

  if (reasons.length) return { ok: false, reasons };
  return { ok: true, cost: costFor(s, def, next), newLevel: next };
}

/** Applies a checked action. Call only after check() returned ok and the cost was paid. */
export function apply(s: Settlement, action: Action, newLevel: BuildingLevel): void {
  const list = (s.buildings[action.id] ??= []);
  if (action.kind === "build") list.push(newLevel);
  else list[action.index] = newLevel;
}
